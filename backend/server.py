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

# ==================== HELPER FUNCTIONS ====================

import math

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two points in kilometers"""
    R = 6371  # Earth's radius in km
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    
    a = math.sin(delta_lat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return R * c

def get_penalty_summary(penalty: dict) -> str:
    """Generate a short penalty summary string"""
    if not penalty.get("enabled", False):
        return "No idle fee"
    
    grace = penalty.get("grace_minutes", 30)
    rate = penalty.get("penalty_cents_per_minute", 0)
    cap = penalty.get("daily_cap_cents")
    
    rate_str = f"€{rate/100:.2f}/min"
    cap_str = f" (max €{cap/100:.0f})" if cap else " (no cap)"
    
    return f"Idle fee after {grace}min: {rate_str}{cap_str}"

# ==================== STATION ENDPOINTS ====================

@api_router.get("/stations")
async def get_stations():
    stations = await db.stations.find().to_list(100)
    result = []
    for station in stations:
        chargers = await db.chargers.find({"station_id": station["id"]}).to_list(100)
        pricing = await db.pricing_plans.find_one({"station_id": station["id"]})
        result.append(serialize_doc({
            **station,
            "chargers": chargers,
            "pricing": pricing
        }))
    return result

@api_router.get("/stations/nearby")
async def get_nearby_stations(
    lat: float,
    lng: float,
    radius_km: float = 10.0,
    connector_type: Optional[str] = None,
    min_power_kw: Optional[float] = None,
    max_price_cents: Optional[int] = None,
    available_only: bool = False,
    sort_by: str = "distance"  # distance, price, power, estimated_cost
):
    """Get stations near a location with filters"""
    all_stations = await db.stations.find().to_list(500)
    
    result = []
    for station in all_stations:
        # Calculate distance
        distance = haversine_distance(lat, lng, station["latitude"], station["longitude"])
        
        # Filter by radius
        if distance > radius_km:
            continue
        
        # Get chargers and pricing
        chargers = await db.chargers.find({"station_id": station["id"]}).to_list(100)
        pricing = await db.pricing_plans.find_one({"station_id": station["id"]})
        
        if not pricing:
            continue
        
        # Filter by connector type
        if connector_type:
            chargers = [c for c in chargers if c["connector_type"] == connector_type]
            if not chargers:
                continue
        
        # Filter by minimum power
        if min_power_kw:
            chargers = [c for c in chargers if c["max_kw"] >= min_power_kw]
            if not chargers:
                continue
        
        # Filter by max price
        if max_price_cents and pricing["energy_rate_cents_per_kwh"] > max_price_cents:
            continue
        
        # Calculate availability
        available_chargers = [c for c in chargers if c["status"] == "AVAILABLE"]
        available_count = len(available_chargers)
        total_count = len(chargers)
        
        # Filter by availability
        if available_only and available_count == 0:
            continue
        
        # Get max power
        max_power = max([c["max_kw"] for c in chargers]) if chargers else 0
        
        # Calculate estimated cost for 20 kWh
        estimated_20kwh = pricing["start_fee_cents"] + (20 * pricing["energy_rate_cents_per_kwh"])
        estimated_20kwh_with_tax = int(estimated_20kwh * (1 + pricing["tax_percent"] / 100))
        
        # Build connector breakdown
        connector_breakdown = {}
        for charger in chargers:
            ct = charger["connector_type"]
            if ct not in connector_breakdown:
                connector_breakdown[ct] = {"total": 0, "available": 0, "max_kw": 0}
            connector_breakdown[ct]["total"] += 1
            connector_breakdown[ct]["max_kw"] = max(connector_breakdown[ct]["max_kw"], charger["max_kw"])
            if charger["status"] == "AVAILABLE":
                connector_breakdown[ct]["available"] += 1
        
        station_data = {
            **station,
            "distance_km": round(distance, 2),
            "pricing_summary": {
                "start_fee_cents": pricing["start_fee_cents"],
                "energy_rate_cents_per_kwh": pricing["energy_rate_cents_per_kwh"],
                "tax_percent": pricing["tax_percent"],
                "penalty_summary": get_penalty_summary(pricing.get("penalty", {})),
                "penalty_enabled": pricing.get("penalty", {}).get("enabled", False),
                "estimated_20kwh_cents": estimated_20kwh_with_tax
            },
            "availability": {
                "available_count": available_count,
                "total_count": total_count,
                "connector_breakdown": connector_breakdown
            },
            "max_power_kw": max_power,
            "updated_at": datetime.utcnow().isoformat()
        }
        
        result.append(serialize_doc(station_data))
    
    # Sort results
    if sort_by == "distance":
        result.sort(key=lambda x: x["distance_km"])
    elif sort_by == "price":
        result.sort(key=lambda x: x["pricing_summary"]["energy_rate_cents_per_kwh"])
    elif sort_by == "power":
        result.sort(key=lambda x: -x["max_power_kw"])
    elif sort_by == "estimated_cost":
        result.sort(key=lambda x: x["pricing_summary"]["estimated_20kwh_cents"])
    
    return result

@api_router.get("/stations/viewport")
async def get_stations_in_viewport(
    min_lat: float,
    max_lat: float,
    min_lng: float,
    max_lng: float,
    connector_type: Optional[str] = None,
    min_power_kw: Optional[float] = None,
    available_only: bool = False
):
    """Get stations within a map viewport (bounding box)"""
    # Query stations within bounds
    stations = await db.stations.find({
        "latitude": {"$gte": min_lat, "$lte": max_lat},
        "longitude": {"$gte": min_lng, "$lte": max_lng}
    }).to_list(200)
    
    result = []
    for station in stations:
        chargers = await db.chargers.find({"station_id": station["id"]}).to_list(100)
        pricing = await db.pricing_plans.find_one({"station_id": station["id"]})
        
        if not pricing:
            continue
        
        # Filter by connector type
        if connector_type:
            chargers = [c for c in chargers if c["connector_type"] == connector_type]
            if not chargers:
                continue
        
        # Filter by minimum power
        if min_power_kw:
            chargers = [c for c in chargers if c["max_kw"] >= min_power_kw]
            if not chargers:
                continue
        
        available_count = len([c for c in chargers if c["status"] == "AVAILABLE"])
        total_count = len(chargers)
        
        if available_only and available_count == 0:
            continue
        
        max_power = max([c["max_kw"] for c in chargers]) if chargers else 0
        
        station_data = {
            "id": station["id"],
            "name": station["name"],
            "latitude": station["latitude"],
            "longitude": station["longitude"],
            "available_count": available_count,
            "total_count": total_count,
            "max_power_kw": max_power,
            "energy_rate_cents": pricing["energy_rate_cents_per_kwh"],
            "has_penalty": pricing.get("penalty", {}).get("enabled", False)
        }
        
        result.append(serialize_doc(station_data))
    
    return result

@api_router.get("/chargers/status/bulk")
async def get_chargers_status_bulk(ids: str):
    """Get status of multiple chargers by IDs (comma-separated)"""
    charger_ids = [id.strip() for id in ids.split(",")]
    chargers = await db.chargers.find({"id": {"$in": charger_ids}}).to_list(100)
    return serialize_doc(chargers)

@api_router.get("/stations/{station_id}")
async def get_station(station_id: str):
    station = await db.stations.find_one({"id": station_id})
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    
    chargers = await db.chargers.find({"station_id": station_id}).to_list(100)
    pricing = await db.pricing_plans.find_one({"station_id": station_id})
    
    return serialize_doc({
        **station,
        "chargers": chargers,
        "pricing": pricing
    })

@api_router.get("/stations/{station_id}/pricing")
async def get_station_pricing(station_id: str):
    pricing = await db.pricing_plans.find_one({"station_id": station_id})
    if not pricing:
        raise HTTPException(status_code=404, detail="Pricing not found")
    return serialize_doc(pricing)

# ==================== CHARGER ENDPOINTS ====================

@api_router.get("/chargers/{charger_id}/status")
async def get_charger_status(charger_id: str):
    charger = await db.chargers.find_one({"id": charger_id})
    if not charger:
        raise HTTPException(status_code=404, detail="Charger not found")
    return serialize_doc(charger)

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
        "charger": serialize_doc(charger),
        "station": serialize_doc(station),
        "pricing": serialize_doc(pricing)
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
        "pricing_snapshot": serialize_doc(pricing_snapshot.dict()),
        "charger": serialize_doc(charger),
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
    
    return serialize_doc({
        **session,
        "station": station,
        "charger": charger,
        "penalty_countdown_seconds": penalty_countdown
    })

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
    
    return serialize_doc({
        **final_session,
        "station": station,
        "charger": charger,
        "payment": payment.dict()
    })

@api_router.get("/sessions/user/history")
async def get_session_history(user: dict = Depends(get_current_user)):
    """Get user's session history"""
    sessions = await db.sessions.find({"user_id": user["id"]}).sort("created_at", -1).to_list(100)
    
    result = []
    for session in sessions:
        station = await db.stations.find_one({"id": session["station_id"]})
        result.append(serialize_doc({
            **session,
            "station": station
        }))
    
    return result

# ==================== SEED DATA ====================

@api_router.post("/seed")
async def seed_data():
    """Seed demo data - 30+ stations around Rotterdam with varied pricing"""
    
    # Clear existing data
    await db.stations.delete_many({})
    await db.chargers.delete_many({})
    await db.pricing_plans.delete_many({})
    
    # Rotterdam center coordinates: 51.9244, 4.4777
    # Generate 30 stations around Rotterdam
    
    station_configs = [
        # Downtown Rotterdam - Fast chargers, moderate pricing
        {"name": "Rotterdam Centraal", "address": "Stationsplein 1, Rotterdam", "lat": 51.9244, "lng": 4.4692, "type": "fast", "chargers": [("CCS", 150), ("CCS", 150), ("CHAdeMO", 100)]},
        {"name": "Markthal Charging Hub", "address": "Dominee Jan Scharpstraat 298, Rotterdam", "lat": 51.9200, "lng": 4.4863, "type": "fast", "chargers": [("CCS", 100), ("CCS", 100)]},
        {"name": "Erasmusbrug Plaza", "address": "Erasmusbrug, Rotterdam", "lat": 51.9094, "lng": 4.4868, "type": "fast", "chargers": [("CCS", 150), ("Type2", 22)]},
        {"name": "Euromast Parking", "address": "Parkhaven 20, Rotterdam", "lat": 51.9054, "lng": 4.4666, "type": "standard", "chargers": [("CCS", 50), ("Type2", 22), ("Type2", 22)]},
        {"name": "Kop van Zuid", "address": "Wilhelminakade 137, Rotterdam", "lat": 51.9028, "lng": 4.4896, "type": "premium", "chargers": [("CCS", 350), ("CCS", 350)]},
        
        # Noord Rotterdam
        {"name": "Blijdorp Zoo Charge", "address": "Blijdorplaan 8, Rotterdam", "lat": 51.9285, "lng": 4.4488, "type": "standard", "chargers": [("Type2", 22), ("Type2", 22), ("Type2", 11)]},
        {"name": "Schiebroek Hub", "address": "Wilgenplaslaan 56, Rotterdam", "lat": 51.9467, "lng": 4.4683, "type": "budget", "chargers": [("Type2", 11), ("Type2", 11)]},
        {"name": "Hillegersberg Charge", "address": "Straatweg 190, Rotterdam", "lat": 51.9512, "lng": 4.4829, "type": "budget", "chargers": [("Type2", 22), ("Type2", 22)]},
        
        # Zuid Rotterdam
        {"name": "Zuidplein Mall", "address": "Zuidplein 100, Rotterdam", "lat": 51.8804, "lng": 4.4835, "type": "standard", "chargers": [("CCS", 50), ("CCS", 50), ("Type2", 22)]},
        {"name": "Ahoy Rotterdam", "address": "Ahoyweg 10, Rotterdam", "lat": 51.8848, "lng": 4.4941, "type": "fast", "chargers": [("CCS", 150), ("CCS", 150), ("CHAdeMO", 100)]},
        {"name": "Feyenoord Stadium", "address": "Van Zandvlietplein 1, Rotterdam", "lat": 51.8939, "lng": 4.5231, "type": "fast", "chargers": [("CCS", 100), ("CCS", 100)]},
        {"name": "Charlois Point", "address": "Groene Hilledijk 315, Rotterdam", "lat": 51.8830, "lng": 4.4599, "type": "budget", "chargers": [("Type2", 22)]},
        
        # Oost Rotterdam
        {"name": "Kralingen Charge", "address": "Kralingse Plaslaan 1, Rotterdam", "lat": 51.9303, "lng": 4.5088, "type": "standard", "chargers": [("CCS", 50), ("Type2", 22)]},
        {"name": "Alexander Station", "address": "Alexander, Rotterdam", "lat": 51.9516, "lng": 4.5532, "type": "fast", "chargers": [("CCS", 150), ("CCS", 100), ("CHAdeMO", 50)]},
        {"name": "Ommoord Hub", "address": "Ommoord, Rotterdam", "lat": 51.9608, "lng": 4.5324, "type": "budget", "chargers": [("Type2", 11), ("Type2", 11), ("Type2", 11)]},
        {"name": "Capelle Noord", "address": "Capelle aan den IJssel", "lat": 51.9331, "lng": 4.5757, "type": "standard", "chargers": [("CCS", 50), ("Type2", 22)]},
        
        # West Rotterdam
        {"name": "Delfshaven Historic", "address": "Delfshaven, Rotterdam", "lat": 51.9058, "lng": 4.4468, "type": "budget", "chargers": [("Type2", 22), ("Type2", 22)]},
        {"name": "Spangen Charge", "address": "Spangen, Rotterdam", "lat": 51.9120, "lng": 4.4320, "type": "budget", "chargers": [("Type2", 11)]},
        {"name": "Schiedam Centrum", "address": "Broersveld, Schiedam", "lat": 51.9177, "lng": 4.3994, "type": "standard", "chargers": [("CCS", 50), ("Type2", 22), ("Type2", 22)]},
        {"name": "Vlaardingen Hub", "address": "Hoogstraat, Vlaardingen", "lat": 51.9122, "lng": 4.3408, "type": "fast", "chargers": [("CCS", 100), ("CCS", 100)]},
        
        # Surrounding areas
        {"name": "Barendrecht Park", "address": "Barendrecht", "lat": 51.8571, "lng": 4.5339, "type": "budget", "chargers": [("Type2", 22), ("Type2", 22)]},
        {"name": "Ridderkerk Station", "address": "Ridderkerk", "lat": 51.8698, "lng": 4.5935, "type": "standard", "chargers": [("CCS", 50), ("Type2", 22)]},
        {"name": "Hoogvliet Center", "address": "Hoogvliet, Rotterdam", "lat": 51.8628, "lng": 4.3533, "type": "standard", "chargers": [("CCS", 50), ("Type2", 11)]},
        {"name": "Pernis Industrial", "address": "Pernis, Rotterdam", "lat": 51.8836, "lng": 4.3866, "type": "fast", "chargers": [("CCS", 150), ("CCS", 100)]},
        {"name": "Rozenburg Port", "address": "Rozenburg", "lat": 51.9003, "lng": 4.2583, "type": "budget", "chargers": [("Type2", 22)]},
        
        # Highway stations
        {"name": "A16 Fastcharge North", "address": "A16 Northbound", "lat": 51.9756, "lng": 4.5194, "type": "premium", "chargers": [("CCS", 350), ("CCS", 350), ("CCS", 150)]},
        {"name": "A15 Truckers Stop", "address": "A15 Europoort", "lat": 51.8936, "lng": 4.3194, "type": "fast", "chargers": [("CCS", 150), ("CCS", 150), ("CHAdeMO", 100)]},
        {"name": "A20 Charging Plaza", "address": "A20 Westbound", "lat": 51.9256, "lng": 4.3458, "type": "fast", "chargers": [("CCS", 150), ("CCS", 100)]},
        {"name": "A4 Service Station", "address": "A4 Direction Den Haag", "lat": 51.9892, "lng": 4.3994, "type": "fast", "chargers": [("CCS", 150), ("CCS", 150), ("CHAdeMO", 100), ("Type2", 22)]},
        
        # Shopping centers
        {"name": "Alexandrium Mall", "address": "Alexandrium, Rotterdam", "lat": 51.9537, "lng": 4.5478, "type": "standard", "chargers": [("CCS", 50), ("CCS", 50), ("Type2", 22), ("Type2", 22)]},
        {"name": "The Hague IKEA", "address": "IKEA Den Haag", "lat": 52.0477, "lng": 4.3826, "type": "standard", "chargers": [("CCS", 50), ("Type2", 22), ("Type2", 22), ("Type2", 22)]},
    ]
    
    # Pricing templates
    pricing_templates = {
        "budget": {
            "start_fee_cents": 0,
            "energy_rate_cents_per_kwh": 25,
            "penalty": PenaltyConfig(enabled=False, grace_minutes=0, penalty_cents_per_minute=0, daily_cap_cents=None),
            "tax_percent": 21.0
        },
        "standard": {
            "start_fee_cents": 50,
            "energy_rate_cents_per_kwh": 35,
            "penalty": PenaltyConfig(enabled=True, grace_minutes=30, penalty_cents_per_minute=25, daily_cap_cents=2500),
            "tax_percent": 21.0
        },
        "fast": {
            "start_fee_cents": 100,
            "energy_rate_cents_per_kwh": 45,
            "penalty": PenaltyConfig(enabled=True, grace_minutes=15, penalty_cents_per_minute=50, daily_cap_cents=3000),
            "tax_percent": 21.0
        },
        "premium": {
            "start_fee_cents": 200,
            "energy_rate_cents_per_kwh": 59,
            "penalty": PenaltyConfig(enabled=True, grace_minutes=10, penalty_cents_per_minute=100, daily_cap_cents=None),
            "tax_percent": 21.0
        }
    }
    
    stations = []
    chargers = []
    pricing_plans = []
    
    for i, config in enumerate(station_configs):
        station_id = f"station-{i+1:03d}"
        
        # Create station
        station = Station(
            id=station_id,
            name=config["name"],
            address=config["address"],
            latitude=config["lat"],
            longitude=config["lng"]
        )
        stations.append(station.dict())
        
        # Create pricing
        template = pricing_templates[config["type"]]
        pricing = PricingPlan(
            id=f"pricing-{i+1:03d}",
            station_id=station_id,
            start_fee_cents=template["start_fee_cents"],
            energy_rate_cents_per_kwh=template["energy_rate_cents_per_kwh"],
            penalty=template["penalty"],
            tax_percent=template["tax_percent"]
        )
        pricing_plans.append(pricing.dict())
        
        # Create chargers with randomized availability
        for j, (connector, power) in enumerate(config["chargers"]):
            # Randomize status: 70% available, 20% charging, 10% faulted
            rand = random.random()
            if rand < 0.7:
                status = "AVAILABLE"
            elif rand < 0.9:
                status = "CHARGING"
            else:
                status = "FAULTED"
            
            charger = Charger(
                id=f"charger-{i+1:03d}-{chr(97+j)}",
                station_id=station_id,
                connector_type=connector,
                max_kw=float(power),
                status=status,
                nfc_payload=f"CHARGETAP-{i+1:03d}-{chr(65+j)}"
            )
            chargers.append(charger.dict())
    
    # Insert all data
    await db.stations.insert_many(stations)
    await db.pricing_plans.insert_many(pricing_plans)
    await db.chargers.insert_many(chargers)
    
    return {
        "message": "Demo data seeded successfully",
        "stations": len(stations),
        "chargers": len(chargers),
        "location": "Rotterdam, Netherlands"
    }

# Availability simulator that updates charger statuses randomly
@api_router.post("/simulate/availability")
async def simulate_availability():
    """Randomly update charger availability for demo purposes"""
    chargers = await db.chargers.find().to_list(500)
    
    updated = 0
    for charger in chargers:
        # 30% chance to change status
        if random.random() < 0.3:
            # Skip chargers with active sessions
            if charger.get("current_session_id"):
                continue
            
            rand = random.random()
            if rand < 0.7:
                new_status = "AVAILABLE"
            elif rand < 0.9:
                new_status = "CHARGING"
            else:
                new_status = "FAULTED"
            
            if new_status != charger["status"]:
                await db.chargers.update_one(
                    {"id": charger["id"]},
                    {"$set": {"status": new_status}}
                )
                updated += 1
    
    return {"message": f"Updated {updated} charger statuses"}

# ==================== NFC HCE TOKEN MANAGEMENT ====================

class NfcTokenProvision(BaseModel):
    device_id: str
    device_model: Optional[str] = None
    android_version: Optional[str] = None
    is_rooted: bool = False

class NfcToken(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    uid: str  # 16-char hex for RFID compatibility
    contract_id: str
    visual_number: str
    type: str = "HCE"
    status: str = "ACTIVE"  # ACTIVE, BLOCKED, EXPIRED
    user_id: str
    device_id: str
    device_model: Optional[str] = None
    android_version: Optional[str] = None
    hce_enabled: bool = False
    is_active: bool = False
    tap_count: int = 0
    last_tap_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

def generate_nfc_uid() -> str:
    """Generate 8-byte hex UID (16 chars) with CT prefix"""
    prefix = bytes([0x43, 0x54])  # 'CT' in hex
    random_bytes = os.urandom(6)
    return (prefix + random_bytes).hex().upper()

def get_nfc_contract_id(counter: int) -> str:
    """Generate human-readable contract ID"""
    year = datetime.utcnow().year
    return f"CTP-NFC-{year}-{counter:06d}"

def mask_uid(uid: str) -> str:
    """Mask UID for display"""
    if len(uid) <= 4:
        return uid
    return "**** " + uid[-4:]

@api_router.post("/nfc/tokens/provision")
async def provision_nfc_token(data: NfcTokenProvision, user: dict = Depends(get_current_user)):
    """Provision a new NFC HCE token for a device"""
    
    # Block rooted devices
    if data.is_rooted:
        raise HTTPException(
            status_code=403, 
            detail="NFC HCE is niet beschikbaar op gerootde apparaten voor veiligheidsredenen."
        )
    
    # Check payment method
    if not user.get("payment_method_added"):
        raise HTTPException(
            status_code=400,
            detail="Voeg eerst een betaalmethode toe voordat je een NFC token aanmaakt."
        )
    
    # Check if device already has a token
    existing = await db.nfc_tokens.find_one({
        "device_id": data.device_id,
        "user_id": user["id"],
        "status": {"$ne": "EXPIRED"}
    })
    
    if existing:
        return serialize_doc({
            "token_uid": existing["uid"],
            "contract_id": existing["contract_id"],
            "visual_number": existing["visual_number"],
            "status": existing["status"],
            "is_active": existing.get("is_active", False),
            "hce_enabled": existing.get("hce_enabled", False),
            "created_at": existing["created_at"],
            "message": "Bestaande token gevonden"
        })
    
    # Get next contract ID counter
    last_token = await db.nfc_tokens.find_one(sort=[("created_at", -1)])
    counter = 1
    if last_token and "contract_id" in last_token:
        try:
            counter = int(last_token["contract_id"].split("-")[-1]) + 1
        except:
            pass
    
    # Generate new token
    uid = generate_nfc_uid()
    contract_id = get_nfc_contract_id(counter)
    visual_number = mask_uid(uid)
    
    token = NfcToken(
        uid=uid,
        contract_id=contract_id,
        visual_number=visual_number,
        user_id=user["id"],
        device_id=data.device_id,
        device_model=data.device_model,
        android_version=data.android_version
    )
    
    await db.nfc_tokens.insert_one(token.dict())
    
    # Audit log
    await db.nfc_token_logs.insert_one({
        "token_id": token.id,
        "action": "CREATED",
        "device_info": f"{data.device_model or 'Unknown'} (Android {data.android_version or '?'})",
        "created_at": datetime.utcnow()
    })
    
    return {
        "token_uid": token.uid,
        "contract_id": token.contract_id,
        "visual_number": token.visual_number,
        "status": token.status,
        "is_active": token.is_active,
        "hce_enabled": token.hce_enabled,
        "created_at": token.created_at.isoformat(),
        "message": "NFC token succesvol aangemaakt",
        "next_steps": [
            "Schakel HCE in via de app instellingen",
            "Test de tap functionaliteit",
            "Gebruik bij ondersteunde laadstations"
        ]
    }

@api_router.get("/nfc/tokens/status")
async def get_nfc_token_status(device_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    """Get NFC token status for current user"""
    
    query = {"user_id": user["id"]}
    if device_id:
        query["device_id"] = device_id
    
    tokens = await db.nfc_tokens.find(query).sort("created_at", -1).to_list(10)
    
    active_token = None
    for t in tokens:
        if t.get("is_active") and t.get("hce_enabled"):
            active_token = t
            break
    
    return serialize_doc({
        "tokens": [{
            "id": t["id"],
            "token_uid": t["uid"],
            "contract_id": t["contract_id"],
            "visual_number": t["visual_number"],
            "status": t["status"],
            "is_active": t.get("is_active", False),
            "hce_enabled": t.get("hce_enabled", False),
            "device_id": t["device_id"],
            "device_model": t.get("device_model"),
            "tap_count": t.get("tap_count", 0),
            "last_tap_at": t.get("last_tap_at"),
            "created_at": t["created_at"]
        } for t in tokens],
        "active_token": {
            "token_uid": active_token["uid"],
            "contract_id": active_token["contract_id"]
        } if active_token else None,
        "total": len(tokens)
    })

@api_router.post("/nfc/tokens/activate")
async def activate_nfc_token(data: dict, user: dict = Depends(get_current_user)):
    """Activate an NFC token for HCE use"""
    
    token_id = data.get("token_id")
    device_id = data.get("device_id")
    
    if not token_id or not device_id:
        raise HTTPException(status_code=400, detail="token_id en device_id zijn vereist")
    
    # Find token
    token = await db.nfc_tokens.find_one({
        "id": token_id,
        "user_id": user["id"],
        "device_id": device_id
    })
    
    if not token:
        raise HTTPException(status_code=404, detail="Token niet gevonden")
    
    if token["status"] != "ACTIVE":
        raise HTTPException(status_code=400, detail=f"Token is {token['status']}")
    
    # Deactivate all other tokens for this user/device
    await db.nfc_tokens.update_many(
        {"user_id": user["id"], "device_id": device_id, "id": {"$ne": token_id}},
        {"$set": {"is_active": False}}
    )
    
    # Activate selected token
    await db.nfc_tokens.update_one(
        {"id": token_id},
        {"$set": {
            "is_active": True,
            "hce_enabled": True,
            "updated_at": datetime.utcnow()
        }}
    )
    
    # Audit log
    await db.nfc_token_logs.insert_one({
        "token_id": token_id,
        "action": "ACTIVATED",
        "created_at": datetime.utcnow()
    })
    
    return {
        "token_uid": token["uid"],
        "contract_id": token["contract_id"],
        "is_active": True,
        "hce_enabled": True,
        "message": "Token geactiveerd voor HCE"
    }

@api_router.post("/nfc/tokens/deactivate")
async def deactivate_nfc_token(data: dict, user: dict = Depends(get_current_user)):
    """Deactivate HCE for a token"""
    
    token_id = data.get("token_id")
    device_id = data.get("device_id")
    
    token = await db.nfc_tokens.find_one({
        "id": token_id,
        "user_id": user["id"],
        "device_id": device_id
    })
    
    if not token:
        raise HTTPException(status_code=404, detail="Token niet gevonden")
    
    await db.nfc_tokens.update_one(
        {"id": token_id},
        {"$set": {
            "is_active": False,
            "hce_enabled": False,
            "updated_at": datetime.utcnow()
        }}
    )
    
    await db.nfc_token_logs.insert_one({
        "token_id": token_id,
        "action": "DEACTIVATED",
        "created_at": datetime.utcnow()
    })
    
    return {"success": True, "message": "HCE uitgeschakeld"}

@api_router.get("/nfc/tokens/active-uid")
async def get_active_nfc_uid(device_id: str, user: dict = Depends(get_current_user)):
    """Get active token UID for HCE service"""
    
    token = await db.nfc_tokens.find_one({
        "user_id": user["id"],
        "device_id": device_id,
        "is_active": True,
        "hce_enabled": True,
        "status": "ACTIVE"
    })
    
    if not token:
        return {"active": False, "token_uid": None}
    
    return {
        "active": True,
        "token_uid": token["uid"],
        "contract_id": token["contract_id"]
    }

@api_router.post("/nfc/tokens/tap")
async def record_nfc_tap(data: dict, user: dict = Depends(get_current_user)):
    """Record a tap event from the HCE service"""
    
    token_uid = data.get("token_uid")
    device_id = data.get("device_id")
    location = data.get("location")
    
    token = await db.nfc_tokens.find_one({
        "uid": token_uid,
        "user_id": user["id"],
        "device_id": device_id
    })
    
    if token:
        await db.nfc_tokens.update_one(
            {"id": token["id"]},
            {"$set": {
                "last_tap_at": datetime.utcnow(),
                "last_location": location
            },
            "$inc": {"tap_count": 1}}
        )
        
        await db.nfc_token_logs.insert_one({
            "token_id": token["id"],
            "action": "TAPPED",
            "location": location,
            "created_at": datetime.utcnow()
        })
    
    return {"success": True, "recorded": token is not None}

# ==================== ROOT ====================

@api_router.get("/")
async def root():
    return {"message": "ChargeTap API", "version": "1.1.0", "features": ["NFC HCE", "QR-Start", "Tap-to-Pay"]}

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
