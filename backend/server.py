from fastapi import FastAPI, APIRouter, HTTPException, Depends, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timedelta
import jwt
import bcrypt
import asyncio
import random
from bson import ObjectId

# Helper to convert MongoDB documents
def serialize_doc(doc):
    """Convert MongoDB document to JSON-serializable dict"""
    if doc is None:
        return None
    if isinstance(doc, list):
        return [serialize_doc(d) for d in doc]
    if isinstance(doc, dict):
        result = {}
        for key, value in doc.items():
            if key == '_id':
                continue  # Skip MongoDB _id
            elif isinstance(value, ObjectId):
                result[key] = str(value)
            elif isinstance(value, datetime):
                result[key] = value.isoformat()
            elif isinstance(value, dict):
                result[key] = serialize_doc(value)
            elif isinstance(value, list):
                result[key] = serialize_doc(value)
            else:
                result[key] = value
        return result
    return doc

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'chargetap_db')]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'chargetap-secret-key-2025')
JWT_ALGORITHM = "HS256"

# Create the main app without a prefix
app = FastAPI(title="ChargeTap API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

security = HTTPBearer()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== MODELS ====================

class UserCreate(BaseModel):
    email: str
    password: str
    name: str

class UserLogin(BaseModel):
    email: str
    password: str

class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    name: str
    password_hash: str
    payment_method_added: bool = False
    payment_method_last4: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class PaymentMethodAdd(BaseModel):
    card_number: str  # Mocked - we just store last 4
    expiry: str
    cvv: str

class PenaltyConfig(BaseModel):
    enabled: bool = True
    grace_minutes: int = 30  # Time before penalty starts after charging completes
    penalty_cents_per_minute: int = 50  # 50 cents per minute idle
    applies_when: str = "charging_complete_but_plugged"  # idle fee
    daily_cap_cents: Optional[int] = 3000  # $30 max per day

class PricingPlan(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    station_id: str
    start_fee_cents: int = 100  # $1.00
    energy_rate_cents_per_kwh: int = 35  # $0.35/kWh
    penalty: PenaltyConfig = Field(default_factory=PenaltyConfig)
    tax_percent: float = 8.5  # 8.5% tax
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Station(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    address: str
    latitude: float
    longitude: float
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Charger(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    station_id: str
    connector_type: str = "CCS"  # CCS, CHAdeMO, Type2
    max_kw: float = 50.0
    status: str = "AVAILABLE"  # AVAILABLE, CHARGING, COMPLETE, FAULTED
    nfc_payload: str = ""  # Unique NFC identifier
    current_session_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class PricingSnapshot(BaseModel):
    start_fee_cents: int
    energy_rate_cents_per_kwh: int
    penalty: PenaltyConfig
    tax_percent: float
    locked_at: datetime = Field(default_factory=datetime.utcnow)

class Session(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    charger_id: str
    station_id: str
    pricing_snapshot: PricingSnapshot
    started_at: datetime = Field(default_factory=datetime.utcnow)
    ended_at: Optional[datetime] = None
    meter_start_kwh: float = 0.0
    meter_end_kwh: float = 0.0
    delivered_kwh: float = 0.0
    current_power_kw: float = 0.0
    battery_percent: Optional[int] = None
    charging_complete_at: Optional[datetime] = None  # When battery full/charging stopped
    penalty_minutes: int = 0
    penalty_cost_cents: int = 0
    energy_cost_cents: int = 0
    tax_cents: int = 0
    total_cost_cents: int = 0
    status: str = "CHARGING"  # CHARGING, COMPLETE, IDLE, ENDED
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Payment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    user_id: str
    amount_cents: int
    status: str = "PENDING"  # PENDING, COMPLETED, FAILED
    stripe_payment_intent_id: str = ""  # Mocked
    created_at: datetime = Field(default_factory=datetime.utcnow)

# ==================== AUTH HELPERS ====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())

def create_token(user_id: str, email: str) -> str:
    payload = {
        "user_id": user_id,
        "email": email,
        "exp": datetime.utcnow() + timedelta(days=30)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"id": payload["user_id"]})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ==================== CHARGER SIMULATOR ====================

# In-memory simulator state
simulator_sessions: Dict[str, dict] = {}

async def simulate_charging(session_id: str):
    """Background task to simulate charging progress"""
    logger.info(f"Starting charging simulation for session {session_id}")
    
    while session_id in simulator_sessions:
        session_data = simulator_sessions[session_id]
        
        if session_data.get("stopped", False):
            break
        
        # Simulate power delivery
        elapsed_seconds = (datetime.utcnow() - session_data["start_time"]).total_seconds()
        
        # Ramp up power over first 30 seconds
        ramp_factor = min(1.0, elapsed_seconds / 30)
        max_power = session_data.get("max_power_kw", 50.0)
        current_power = max_power * ramp_factor * random.uniform(0.9, 1.0)
        
        # Calculate energy delivered (kWh = kW * hours)
        hours = elapsed_seconds / 3600
        delivered_kwh = max_power * ramp_factor * hours * 0.85  # 85% efficiency factor
        
        # Simulate battery percentage (starts at 20%, fills up)
        battery_percent = min(100, int(20 + (delivered_kwh / 60) * 100))  # Assumes ~60kWh battery
        
        # Update session in database
        session = await db.sessions.find_one({"id": session_id})
        if session:
            pricing = session["pricing_snapshot"]
            
            # Calculate costs
            energy_cost_cents = int(delivered_kwh * pricing["energy_rate_cents_per_kwh"])
            subtotal = pricing["start_fee_cents"] + energy_cost_cents
            
            # Check for penalty (if charging complete but still plugged)
            penalty_cost_cents = 0
            penalty_minutes = 0
            charging_complete_at = session.get("charging_complete_at")
            
            if battery_percent >= 100 and not charging_complete_at:
                # Mark charging as complete
                charging_complete_at = datetime.utcnow()
                await db.sessions.update_one(
                    {"id": session_id},
                    {"$set": {"charging_complete_at": charging_complete_at, "status": "COMPLETE"}}
                )
                session_data["charging_complete_at"] = charging_complete_at
                
                # Update charger status
                await db.chargers.update_one(
                    {"id": session["charger_id"]},
                    {"$set": {"status": "COMPLETE"}}
                )
            
            if charging_complete_at:
                # Calculate penalty if grace period passed
                idle_minutes = (datetime.utcnow() - charging_complete_at).total_seconds() / 60
                grace_minutes = pricing["penalty"].get("grace_minutes", 30)
                
                if pricing["penalty"].get("enabled", True) and idle_minutes > grace_minutes:
                    penalty_minutes = int(idle_minutes - grace_minutes)
                    penalty_rate = pricing["penalty"].get("penalty_cents_per_minute", 50)
                    penalty_cost_cents = penalty_minutes * penalty_rate
                    
                    # Apply daily cap if exists
                    daily_cap = pricing["penalty"].get("daily_cap_cents")
                    if daily_cap:
                        penalty_cost_cents = min(penalty_cost_cents, daily_cap)
                    
                    # Update status to IDLE when penalty starts
                    if penalty_minutes > 0:
                        await db.chargers.update_one(
                            {"id": session["charger_id"]},
                            {"$set": {"status": "IDLE"}}
                        )
            
            # Calculate tax and total
            subtotal_with_penalty = subtotal + penalty_cost_cents
            tax_cents = int(subtotal_with_penalty * pricing["tax_percent"] / 100)
            total_cost_cents = subtotal_with_penalty + tax_cents
            
            # Update session
            await db.sessions.update_one(
                {"id": session_id},
                {"$set": {
                    "delivered_kwh": round(delivered_kwh, 3),
                    "current_power_kw": round(current_power, 1),
                    "battery_percent": battery_percent,
                    "energy_cost_cents": energy_cost_cents,
                    "penalty_minutes": penalty_minutes,
                    "penalty_cost_cents": penalty_cost_cents,
                    "tax_cents": tax_cents,
                    "total_cost_cents": total_cost_cents,
                    "meter_end_kwh": session.get("meter_start_kwh", 0) + delivered_kwh
                }}
            )
        
        await asyncio.sleep(2)  # Update every 2 seconds
    
    logger.info(f"Charging simulation ended for session {session_id}")

# ==================== AUTH ENDPOINTS ====================

@api_router.post("/auth/register")
async def register(user_data: UserCreate):
    # Check if email exists
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user = User(
        email=user_data.email,
        name=user_data.name,
        password_hash=hash_password(user_data.password)
    )
    await db.users.insert_one(user.dict())
    
    token = create_token(user.id, user.email)
    return {
        "token": token,
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "payment_method_added": user.payment_method_added
        }
    }

@api_router.post("/auth/login")
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email})
    if not user or not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    token = create_token(user["id"], user["email"])
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "payment_method_added": user.get("payment_method_added", False),
            "payment_method_last4": user.get("payment_method_last4")
        }
    }

@api_router.get("/users/me")
async def get_me(user: dict = Depends(get_current_user)):
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "payment_method_added": user.get("payment_method_added", False),
        "payment_method_last4": user.get("payment_method_last4")
    }

@api_router.post("/users/payment-method")
async def add_payment_method(payment: PaymentMethodAdd, user: dict = Depends(get_current_user)):
    """Mock payment method addition - just stores last 4 digits"""
    last4 = payment.card_number[-4:]
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "payment_method_added": True,
            "payment_method_last4": last4
        }}
    )
    return {"success": True, "last4": last4}

# ==================== STATION ENDPOINTS ====================

@api_router.get("/stations")
async def get_stations():
    stations = await db.stations.find().to_list(100)
    result = []
    for station in stations:
        chargers = await db.chargers.find({"station_id": station["id"]}).to_list(100)
        pricing = await db.pricing_plans.find_one({"station_id": station["id"]})
        result.append({
            **station,
            "chargers": chargers,
            "pricing": pricing
        })
    return result

@api_router.get("/stations/{station_id}")
async def get_station(station_id: str):
    station = await db.stations.find_one({"id": station_id})
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    
    chargers = await db.chargers.find({"station_id": station_id}).to_list(100)
    pricing = await db.pricing_plans.find_one({"station_id": station_id})
    
    return {
        **station,
        "chargers": chargers,
        "pricing": pricing
    }

@api_router.get("/stations/{station_id}/pricing")
async def get_station_pricing(station_id: str):
    pricing = await db.pricing_plans.find_one({"station_id": station_id})
    if not pricing:
        raise HTTPException(status_code=404, detail="Pricing not found")
    return pricing

# ==================== CHARGER ENDPOINTS ====================

@api_router.get("/chargers/{charger_id}/status")
async def get_charger_status(charger_id: str):
    charger = await db.chargers.find_one({"id": charger_id})
    if not charger:
        raise HTTPException(status_code=404, detail="Charger not found")
    return charger

# ==================== NFC ENDPOINTS ====================

@api_router.post("/nfc/resolve")
async def resolve_nfc(payload: dict):
    """Resolve NFC payload to charger info and pricing"""
    nfc_payload = payload.get("nfc_payload", "")
    
    # Find charger by NFC payload
    charger = await db.chargers.find_one({"nfc_payload": nfc_payload})
    if not charger:
        # Try to find by charger ID directly (fallback)
        charger = await db.chargers.find_one({"id": nfc_payload})
    
    if not charger:
        raise HTTPException(status_code=404, detail="Charger not found")
    
    station = await db.stations.find_one({"id": charger["station_id"]})
    pricing = await db.pricing_plans.find_one({"station_id": charger["station_id"]})
    
    if not station or not pricing:
        raise HTTPException(status_code=404, detail="Station or pricing not found")
    
    return {
        "charger": charger,
        "station": station,
        "pricing": pricing
    }

# ==================== SESSION ENDPOINTS ====================

@api_router.post("/sessions/start")
async def start_session(data: dict, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user)):
    """Start a charging session"""
    charger_id = data.get("charger_id")
    
    # Check if user has payment method
    if not user.get("payment_method_added"):
        raise HTTPException(status_code=400, detail="Please add a payment method first")
    
    # Get charger
    charger = await db.chargers.find_one({"id": charger_id})
    if not charger:
        raise HTTPException(status_code=404, detail="Charger not found")
    
    if charger["status"] != "AVAILABLE":
        raise HTTPException(status_code=400, detail=f"Charger is {charger['status']}, not available")
    
    # Get pricing and create snapshot
    pricing = await db.pricing_plans.find_one({"station_id": charger["station_id"]})
    if not pricing:
        raise HTTPException(status_code=404, detail="Pricing not found")
    
    pricing_snapshot = PricingSnapshot(
        start_fee_cents=pricing["start_fee_cents"],
        energy_rate_cents_per_kwh=pricing["energy_rate_cents_per_kwh"],
        penalty=PenaltyConfig(**pricing["penalty"]),
        tax_percent=pricing["tax_percent"]
    )
    
    # Create session
    session = Session(
        user_id=user["id"],
        charger_id=charger_id,
        station_id=charger["station_id"],
        pricing_snapshot=pricing_snapshot,
        meter_start_kwh=random.uniform(1000, 5000)  # Simulated meter reading
    )
    
    await db.sessions.insert_one(session.dict())
    
    # Update charger status
    await db.chargers.update_one(
        {"id": charger_id},
        {"$set": {"status": "CHARGING", "current_session_id": session.id}}
    )
    
    # Start simulator
    simulator_sessions[session.id] = {
        "start_time": datetime.utcnow(),
        "max_power_kw": charger["max_kw"],
        "stopped": False
    }
    background_tasks.add_task(simulate_charging, session.id)
    
    return {
        "session_id": session.id,
        "pricing_snapshot": pricing_snapshot.dict(),
        "charger": charger,
        "message": "Charging started successfully"
    }

@api_router.get("/sessions/{session_id}")
async def get_session(session_id: str, user: dict = Depends(get_current_user)):
    """Get session status with live metrics"""
    session = await db.sessions.find_one({"id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your session")
    
    # Get station info
    station = await db.stations.find_one({"id": session["station_id"]})
    charger = await db.chargers.find_one({"id": session["charger_id"]})
    
    # Calculate penalty countdown if applicable
    penalty_countdown = None
    pricing = session["pricing_snapshot"]
    
    if session["status"] == "COMPLETE" and session.get("charging_complete_at"):
        complete_time = session["charging_complete_at"]
        if isinstance(complete_time, str):
            complete_time = datetime.fromisoformat(complete_time.replace('Z', '+00:00'))
        
        grace_minutes = pricing["penalty"].get("grace_minutes", 30)
        penalty_start_time = complete_time + timedelta(minutes=grace_minutes)
        seconds_until_penalty = (penalty_start_time - datetime.utcnow()).total_seconds()
        
        if seconds_until_penalty > 0:
            penalty_countdown = int(seconds_until_penalty)
    
    return {
        **session,
        "station": station,
        "charger": charger,
        "penalty_countdown_seconds": penalty_countdown
    }

@api_router.post("/sessions/{session_id}/stop")
async def stop_session(session_id: str, user: dict = Depends(get_current_user)):
    """Stop a charging session"""
    session = await db.sessions.find_one({"id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your session")
    
    if session["status"] == "ENDED":
        raise HTTPException(status_code=400, detail="Session already ended")
    
    # Stop simulator
    if session_id in simulator_sessions:
        simulator_sessions[session_id]["stopped"] = True
        del simulator_sessions[session_id]
    
    # Update session
    await db.sessions.update_one(
        {"id": session_id},
        {"$set": {
            "status": "ENDED",
            "ended_at": datetime.utcnow()
        }}
    )
    
    # Update charger
    await db.chargers.update_one(
        {"id": session["charger_id"]},
        {"$set": {"status": "AVAILABLE", "current_session_id": None}}
    )
    
    # Create mock payment
    payment = Payment(
        session_id=session_id,
        user_id=user["id"],
        amount_cents=session["total_cost_cents"],
        status="COMPLETED",
        stripe_payment_intent_id=f"pi_mock_{uuid.uuid4().hex[:16]}"
    )
    await db.payments.insert_one(payment.dict())
    
    # Get final session data
    final_session = await db.sessions.find_one({"id": session_id})
    station = await db.stations.find_one({"id": final_session["station_id"]})
    charger = await db.chargers.find_one({"id": final_session["charger_id"]})
    
    return {
        **final_session,
        "station": station,
        "charger": charger,
        "payment": payment.dict()
    }

@api_router.get("/sessions/user/history")
async def get_session_history(user: dict = Depends(get_current_user)):
    """Get user's session history"""
    sessions = await db.sessions.find({"user_id": user["id"]}).sort("created_at", -1).to_list(100)
    
    result = []
    for session in sessions:
        station = await db.stations.find_one({"id": session["station_id"]})
        result.append({
            **session,
            "station": station
        })
    
    return result

# ==================== SEED DATA ====================

@api_router.post("/seed")
async def seed_data():
    """Seed demo data - 3 stations with different pricing"""
    
    # Clear existing data
    await db.stations.delete_many({})
    await db.chargers.delete_many({})
    await db.pricing_plans.delete_many({})
    
    # Station 1: Downtown Fast Charge - Standard pricing
    station1 = Station(
        id="station-001",
        name="Downtown Fast Charge",
        address="123 Main Street, San Francisco, CA 94102",
        latitude=37.7749,
        longitude=-122.4194
    )
    
    pricing1 = PricingPlan(
        id="pricing-001",
        station_id="station-001",
        start_fee_cents=100,  # $1.00
        energy_rate_cents_per_kwh=35,  # $0.35/kWh
        penalty=PenaltyConfig(
            enabled=True,
            grace_minutes=30,
            penalty_cents_per_minute=50,  # $0.50/min
            applies_when="charging_complete_but_plugged",
            daily_cap_cents=3000  # $30 max
        ),
        tax_percent=8.5
    )
    
    charger1a = Charger(
        id="charger-001a",
        station_id="station-001",
        connector_type="CCS",
        max_kw=50.0,
        status="AVAILABLE",
        nfc_payload="CHARGETAP-001A"
    )
    
    charger1b = Charger(
        id="charger-001b",
        station_id="station-001",
        connector_type="CHAdeMO",
        max_kw=50.0,
        status="AVAILABLE",
        nfc_payload="CHARGETAP-001B"
    )
    
    # Station 2: Highway Supercharger - Premium pricing, no penalty cap
    station2 = Station(
        id="station-002",
        name="Highway Supercharger",
        address="456 Highway 101, Palo Alto, CA 94301",
        latitude=37.4419,
        longitude=-122.1430
    )
    
    pricing2 = PricingPlan(
        id="pricing-002",
        station_id="station-002",
        start_fee_cents=200,  # $2.00
        energy_rate_cents_per_kwh=45,  # $0.45/kWh
        penalty=PenaltyConfig(
            enabled=True,
            grace_minutes=15,  # Shorter grace period
            penalty_cents_per_minute=100,  # $1.00/min - aggressive!
            applies_when="charging_complete_but_plugged",
            daily_cap_cents=None  # No cap!
        ),
        tax_percent=9.25
    )
    
    charger2a = Charger(
        id="charger-002a",
        station_id="station-002",
        connector_type="CCS",
        max_kw=150.0,  # Fast charger
        status="AVAILABLE",
        nfc_payload="CHARGETAP-002A"
    )
    
    # Station 3: Neighborhood Charge - Budget friendly, no penalties
    station3 = Station(
        id="station-003",
        name="Neighborhood Charge",
        address="789 Oak Avenue, Oakland, CA 94612",
        latitude=37.8044,
        longitude=-122.2712
    )
    
    pricing3 = PricingPlan(
        id="pricing-003",
        station_id="station-003",
        start_fee_cents=0,  # No start fee!
        energy_rate_cents_per_kwh=28,  # $0.28/kWh - cheapest
        penalty=PenaltyConfig(
            enabled=False,  # No penalty!
            grace_minutes=0,
            penalty_cents_per_minute=0,
            applies_when="charging_complete_but_plugged",
            daily_cap_cents=None
        ),
        tax_percent=8.0
    )
    
    charger3a = Charger(
        id="charger-003a",
        station_id="station-003",
        connector_type="Type2",
        max_kw=22.0,  # Level 2 charger
        status="AVAILABLE",
        nfc_payload="CHARGETAP-003A"
    )
    
    charger3b = Charger(
        id="charger-003b",
        station_id="station-003",
        connector_type="Type2",
        max_kw=22.0,
        status="AVAILABLE",
        nfc_payload="CHARGETAP-003B"
    )
    
    # Insert all data
    await db.stations.insert_many([station1.dict(), station2.dict(), station3.dict()])
    await db.pricing_plans.insert_many([pricing1.dict(), pricing2.dict(), pricing3.dict()])
    await db.chargers.insert_many([
        charger1a.dict(), charger1b.dict(),
        charger2a.dict(),
        charger3a.dict(), charger3b.dict()
    ])
    
    return {"message": "Demo data seeded successfully", "stations": 3, "chargers": 5}

# ==================== ROOT ====================

@api_router.get("/")
async def root():
    return {"message": "ChargeTap API", "version": "1.0.0"}

@api_router.get("/health")
async def health():
    return {"status": "healthy"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
