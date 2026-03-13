"""
OCPI Service Layer for Tappy Charge
=================================
Handles OCPI protocol communication with CPOs.
Includes a mock CPO simulator for testing.
"""

import asyncio
import uuid
import httpx
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

# OCPI Configuration
OCPI_VERSION = "2.2.1"
EMSP_COUNTRY_CODE = "NL"
EMSP_PARTY_ID = "CTP"  # Tappy Charge
EMSP_BASE_URL = "https://tap-global.preview.emergentagent.com/ocpi/emsp"


class OcpiService:
    """OCPI Service for eMSP operations"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.http_client = httpx.AsyncClient(timeout=30.0)
        
    async def close(self):
        await self.http_client.aclose()
    
    # ==================== PROVIDER MANAGEMENT ====================
    
    async def register_provider(self, provider_data: dict) -> dict:
        """Register or update a CPO provider"""
        provider = {
            "id": str(uuid.uuid4()),
            "country_code": provider_data["country_code"],
            "party_id": provider_data["party_id"],
            "name": provider_data["name"],
            "base_url": provider_data["base_url"],
            "token_a": provider_data.get("token_a"),  # Our token to call them
            "token_b": provider_data.get("token_b"),  # Their token to call us
            "token_c": str(uuid.uuid4()),  # Generated token for ongoing comm
            "roles": provider_data.get("roles", ["CPO"]),
            "status": "ACTIVE",
            "created_at": datetime.utcnow(),
            "last_updated": datetime.utcnow()
        }
        
        # Upsert based on country_code + party_id
        await self.db.ocpi_providers.update_one(
            {"country_code": provider["country_code"], "party_id": provider["party_id"]},
            {"$set": provider},
            upsert=True
        )
        
        return provider
    
    async def get_provider(self, country_code: str, party_id: str) -> Optional[dict]:
        """Get provider by country code and party ID"""
        return await self.db.ocpi_providers.find_one({
            "country_code": country_code,
            "party_id": party_id
        })
    
    # ==================== TOKEN MANAGEMENT ====================
    
    async def create_user_token(self, user_id: str, user_name: str) -> dict:
        """Create an OCPI token for a user"""
        token_uid = f"CTP-{uuid.uuid4().hex[:12].upper()}"
        
        token = {
            "uid": token_uid,
            "country_code": EMSP_COUNTRY_CODE,
            "party_id": EMSP_PARTY_ID,
            "type": "APP_USER",
            "contract_id": f"NL-CTP-{user_id[:8].upper()}",
            "visual_number": token_uid,
            "issuer": "Tappy Charge",
            "user_id": user_id,
            "valid": True,
            "whitelist": "ALWAYS",
            "language": "nl",
            "last_updated": datetime.utcnow(),
            "created_at": datetime.utcnow()
        }
        
        await self.db.ocpi_tokens.insert_one(token)
        return token
    
    async def get_user_token(self, user_id: str) -> Optional[dict]:
        """Get or create OCPI token for user"""
        token = await self.db.ocpi_tokens.find_one({"user_id": user_id, "valid": True})
        if not token:
            user = await self.db.users.find_one({"id": user_id})
            if user:
                token = await self.create_user_token(user_id, user.get("name", "User"))
        return token
    
    async def get_token_by_uid(self, token_uid: str) -> Optional[dict]:
        """Get token by UID for CPO whitelist lookup"""
        return await self.db.ocpi_tokens.find_one({"uid": token_uid})
    
    # ==================== LOCATION MANAGEMENT ====================
    
    async def store_location(self, location_data: dict) -> dict:
        """Store or update a location from CPO"""
        location_key = {
            "country_code": location_data["country_code"],
            "party_id": location_data["party_id"],
            "id": location_data["id"]
        }
        
        location_data["stored_at"] = datetime.utcnow()
        
        await self.db.ocpi_locations.update_one(
            location_key,
            {"$set": location_data},
            upsert=True
        )
        
        return location_data
    
    async def get_location(self, country_code: str, party_id: str, location_id: str) -> Optional[dict]:
        """Get a specific location"""
        return await self.db.ocpi_locations.find_one({
            "country_code": country_code,
            "party_id": party_id,
            "id": location_id
        })
    
    async def get_locations_by_provider(self, country_code: str, party_id: str) -> List[dict]:
        """Get all locations for a provider"""
        cursor = self.db.ocpi_locations.find({
            "country_code": country_code,
            "party_id": party_id
        })
        return await cursor.to_list(1000)
    
    async def get_all_ocpi_locations(self) -> List[dict]:
        """Get all OCPI locations"""
        cursor = self.db.ocpi_locations.find({})
        return await cursor.to_list(1000)
    
    # ==================== TARIFF MANAGEMENT ====================
    
    async def store_tariff(self, tariff_data: dict) -> dict:
        """Store or update a tariff from CPO"""
        tariff_key = {
            "country_code": tariff_data["country_code"],
            "party_id": tariff_data["party_id"],
            "id": tariff_data["id"]
        }
        
        tariff_data["stored_at"] = datetime.utcnow()
        
        await self.db.ocpi_tariffs.update_one(
            tariff_key,
            {"$set": tariff_data},
            upsert=True
        )
        
        return tariff_data
    
    async def get_tariff(self, country_code: str, party_id: str, tariff_id: str) -> Optional[dict]:
        """Get a specific tariff"""
        return await self.db.ocpi_tariffs.find_one({
            "country_code": country_code,
            "party_id": party_id,
            "id": tariff_id
        })
    
    async def calculate_price_estimate(
        self,
        tariff: dict,
        estimated_kwh: float,
        estimated_duration_minutes: int
    ) -> dict:
        """Calculate price estimate based on tariff"""
        currency = tariff.get("currency", "EUR")
        
        energy_cost = 0
        time_cost = 0
        parking_cost = 0
        flat_cost = 0
        breakdown = []
        
        for element in tariff.get("elements", []):
            for component in element.get("price_components", []):
                comp_type = component.get("type")
                price = component.get("price", 0)
                step_size = component.get("step_size", 1)
                vat = component.get("vat", 0)
                
                if comp_type == "ENERGY":
                    cost = int(estimated_kwh * price * 100)  # Convert to cents
                    energy_cost += cost
                    breakdown.append({
                        "type": "ENERGY",
                        "description": f"{estimated_kwh} kWh × €{price}/kWh",
                        "cost_cents": cost
                    })
                    
                elif comp_type == "TIME":
                    # Time is usually per hour
                    hours = estimated_duration_minutes / 60
                    cost = int(hours * price * 100)
                    time_cost += cost
                    breakdown.append({
                        "type": "TIME",
                        "description": f"{estimated_duration_minutes} min × €{price}/hour",
                        "cost_cents": cost
                    })
                    
                elif comp_type == "PARKING_TIME":
                    # Parking time after charging (assume 0 for estimate)
                    pass
                    
                elif comp_type == "FLAT":
                    cost = int(price * 100)
                    flat_cost += cost
                    breakdown.append({
                        "type": "FLAT",
                        "description": f"Start fee",
                        "cost_cents": cost
                    })
        
        total = energy_cost + time_cost + parking_cost + flat_cost
        vat_rate = 0.21  # 21% Dutch VAT
        vat_cents = int(total * vat_rate)
        
        return {
            "currency": currency,
            "energy_cost_cents": energy_cost,
            "time_cost_cents": time_cost,
            "parking_cost_cents": parking_cost,
            "flat_cost_cents": flat_cost,
            "total_cost_cents": total,
            "vat_cents": vat_cents,
            "grand_total_cents": total + vat_cents,
            "tariff_id": tariff.get("id"),
            "breakdown": breakdown
        }
    
    # ==================== COMMAND MANAGEMENT ====================
    
    async def send_start_session_command(
        self,
        user_id: str,
        provider: dict,
        location_id: str,
        evse_uid: str,
        connector_id: str
    ) -> dict:
        """Send START_SESSION command to CPO"""
        
        # Get user's token
        token = await self.get_user_token(user_id)
        if not token:
            raise ValueError("User has no valid OCPI token")
        
        # Create command record
        command_id = str(uuid.uuid4())
        authorization_reference = f"AUTH-{uuid.uuid4().hex[:8].upper()}"
        
        command = {
            "id": command_id,
            "type": "START_SESSION",
            "user_id": user_id,
            "provider_country_code": provider["country_code"],
            "provider_party_id": provider["party_id"],
            "location_id": location_id,
            "evse_uid": evse_uid,
            "connector_id": connector_id,
            "authorization_reference": authorization_reference,
            "token_uid": token["uid"],
            "status": "PENDING",
            "response": None,
            "result": None,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        await self.db.ocpi_commands.insert_one(command)
        
        # Build OCPI command payload
        response_url = f"{EMSP_BASE_URL}/{OCPI_VERSION}/commands/START_SESSION/{command_id}"
        
        ocpi_token = {
            "country_code": token["country_code"],
            "party_id": token["party_id"],
            "uid": token["uid"],
            "type": token["type"],
            "contract_id": token["contract_id"],
            "issuer": token["issuer"],
            "valid": token["valid"],
            "whitelist": token["whitelist"],
            "last_updated": token["last_updated"].isoformat() if isinstance(token["last_updated"], datetime) else token["last_updated"]
        }
        
        command_payload = {
            "response_url": response_url,
            "token": ocpi_token,
            "location_id": location_id,
            "evse_uid": evse_uid,
            "connector_id": connector_id,
            "authorization_reference": authorization_reference
        }
        
        # Send command to CPO
        cpo_url = f"{provider['base_url']}/ocpi/cpo/{OCPI_VERSION}/commands/START_SESSION"
        
        try:
            logger.info(f"Sending START_SESSION to {cpo_url}")
            
            # For mock provider, use simulator
            if provider.get("is_mock", False):
                response_data = await MockCpoSimulator.handle_start_session(
                    self.db, command_payload, command_id
                )
            else:
                response = await self.http_client.post(
                    cpo_url,
                    json=command_payload,
                    headers={
                        "Authorization": f"Token {provider['token_a']}",
                        "Content-Type": "application/json"
                    }
                )
                response.raise_for_status()
                response_data = response.json()
            
            # Update command with response
            await self.db.ocpi_commands.update_one(
                {"id": command_id},
                {"$set": {
                    "status": "SENT",
                    "response": response_data,
                    "updated_at": datetime.utcnow()
                }}
            )
            
            command["response"] = response_data
            command["status"] = "SENT"
            
            return command
            
        except Exception as e:
            logger.error(f"Failed to send START_SESSION: {e}")
            await self.db.ocpi_commands.update_one(
                {"id": command_id},
                {"$set": {
                    "status": "FAILED",
                    "error": str(e),
                    "updated_at": datetime.utcnow()
                }}
            )
            raise
    
    async def send_stop_session_command(
        self,
        user_id: str,
        session_id: str
    ) -> dict:
        """Send STOP_SESSION command to CPO"""
        
        # Get the session
        session = await self.db.ocpi_sessions.find_one({"id": session_id})
        if not session:
            raise ValueError("Session not found")
        
        if session.get("user_id") != user_id:
            raise ValueError("Session does not belong to user")
        
        # Get provider
        provider = await self.get_provider(
            session["country_code"],
            session["party_id"]
        )
        if not provider:
            raise ValueError("Provider not found")
        
        # Create command record
        command_id = str(uuid.uuid4())
        
        command = {
            "id": command_id,
            "type": "STOP_SESSION",
            "user_id": user_id,
            "session_id": session_id,
            "provider_country_code": provider["country_code"],
            "provider_party_id": provider["party_id"],
            "status": "PENDING",
            "response": None,
            "result": None,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        await self.db.ocpi_commands.insert_one(command)
        
        # Build OCPI command payload
        response_url = f"{EMSP_BASE_URL}/{OCPI_VERSION}/commands/STOP_SESSION/{command_id}"
        
        command_payload = {
            "response_url": response_url,
            "session_id": session_id
        }
        
        # Send command to CPO
        cpo_url = f"{provider['base_url']}/ocpi/cpo/{OCPI_VERSION}/commands/STOP_SESSION"
        
        try:
            logger.info(f"Sending STOP_SESSION to {cpo_url}")
            
            # For mock provider, use simulator
            if provider.get("is_mock", False):
                response_data = await MockCpoSimulator.handle_stop_session(
                    self.db, command_payload, command_id
                )
            else:
                response = await self.http_client.post(
                    cpo_url,
                    json=command_payload,
                    headers={
                        "Authorization": f"Token {provider['token_a']}",
                        "Content-Type": "application/json"
                    }
                )
                response.raise_for_status()
                response_data = response.json()
            
            # Update command with response
            await self.db.ocpi_commands.update_one(
                {"id": command_id},
                {"$set": {
                    "status": "SENT",
                    "response": response_data,
                    "updated_at": datetime.utcnow()
                }}
            )
            
            command["response"] = response_data
            command["status"] = "SENT"
            
            return command
            
        except Exception as e:
            logger.error(f"Failed to send STOP_SESSION: {e}")
            await self.db.ocpi_commands.update_one(
                {"id": command_id},
                {"$set": {
                    "status": "FAILED",
                    "error": str(e),
                    "updated_at": datetime.utcnow()
                }}
            )
            raise
    
    async def handle_command_result(self, command_type: str, command_id: str, result: dict) -> dict:
        """Handle async command result from CPO"""
        command = await self.db.ocpi_commands.find_one({"id": command_id})
        if not command:
            raise ValueError("Command not found")
        
        await self.db.ocpi_commands.update_one(
            {"id": command_id},
            {"$set": {
                "status": "COMPLETED" if result.get("result") == "ACCEPTED" else "REJECTED",
                "result": result,
                "updated_at": datetime.utcnow()
            }}
        )
        
        return {"status": "OK"}
    
    # ==================== SESSION MANAGEMENT ====================
    
    async def store_session(self, session_data: dict, user_id: Optional[str] = None) -> dict:
        """Store or update a session from CPO"""
        session_key = {
            "country_code": session_data["country_code"],
            "party_id": session_data["party_id"],
            "id": session_data["id"]
        }
        
        # Try to find user by token if not provided
        if not user_id and session_data.get("cdr_token"):
            token = await self.get_token_by_uid(session_data["cdr_token"].get("uid"))
            if token:
                user_id = token.get("user_id")
        
        session_data["user_id"] = user_id
        session_data["stored_at"] = datetime.utcnow()
        
        await self.db.ocpi_sessions.update_one(
            session_key,
            {"$set": session_data},
            upsert=True
        )
        
        return session_data
    
    async def get_session(self, country_code: str, party_id: str, session_id: str) -> Optional[dict]:
        """Get a specific session"""
        return await self.db.ocpi_sessions.find_one({
            "country_code": country_code,
            "party_id": party_id,
            "id": session_id
        })
    
    async def get_user_active_sessions(self, user_id: str) -> List[dict]:
        """Get all active sessions for a user"""
        cursor = self.db.ocpi_sessions.find({
            "user_id": user_id,
            "status": {"$in": ["ACTIVE", "PENDING"]}
        })
        return await cursor.to_list(100)
    
    async def get_user_sessions(self, user_id: str, limit: int = 50) -> List[dict]:
        """Get all sessions for a user"""
        cursor = self.db.ocpi_sessions.find({"user_id": user_id}).sort("start_date_time", -1).limit(limit)
        return await cursor.to_list(limit)
    
    # ==================== CDR MANAGEMENT ====================
    
    async def store_cdr(self, cdr_data: dict) -> dict:
        """Store a CDR from CPO and create invoice items"""
        cdr_key = {
            "country_code": cdr_data["country_code"],
            "party_id": cdr_data["party_id"],
            "id": cdr_data["id"]
        }
        
        # Find user by token
        user_id = None
        if cdr_data.get("cdr_token"):
            token = await self.get_token_by_uid(cdr_data["cdr_token"].get("uid"))
            if token:
                user_id = token.get("user_id")
        
        cdr_data["user_id"] = user_id
        cdr_data["stored_at"] = datetime.utcnow()
        cdr_data["invoice_created"] = False
        
        await self.db.ocpi_cdrs.update_one(
            cdr_key,
            {"$set": cdr_data},
            upsert=True
        )
        
        # Update related session if exists
        if cdr_data.get("session_id"):
            await self.db.ocpi_sessions.update_one(
                {"id": cdr_data["session_id"]},
                {"$set": {
                    "status": "COMPLETED",
                    "cdr_id": cdr_data["id"],
                    "total_cost": cdr_data.get("total_cost")
                }}
            )
        
        return cdr_data


class MockCpoSimulator:
    """Mock CPO Simulator for testing OCPI flows"""
    
    @staticmethod
    async def handle_start_session(db: AsyncIOMotorDatabase, command: dict, command_id: str) -> dict:
        """Simulate CPO handling START_SESSION command"""
        
        # Return immediate ACCEPTED response
        response = {
            "data": {
                "result": "ACCEPTED",
                "timeout": 30
            },
            "status_code": 1000,
            "status_message": "Accepted",
            "timestamp": datetime.utcnow().isoformat()
        }
        
        # Schedule async session creation and result callback
        asyncio.create_task(
            MockCpoSimulator._simulate_session_start(db, command, command_id)
        )
        
        return response
    
    @staticmethod
    async def handle_stop_session(db: AsyncIOMotorDatabase, command: dict, command_id: str) -> dict:
        """Simulate CPO handling STOP_SESSION command"""
        
        response = {
            "data": {
                "result": "ACCEPTED",
                "timeout": 30
            },
            "status_code": 1000,
            "status_message": "Accepted",
            "timestamp": datetime.utcnow().isoformat()
        }
        
        # Schedule async session stop
        asyncio.create_task(
            MockCpoSimulator._simulate_session_stop(db, command, command_id)
        )
        
        return response
    
    @staticmethod
    async def _simulate_session_start(db: AsyncIOMotorDatabase, command: dict, command_id: str):
        """Simulate the async session start flow"""
        await asyncio.sleep(2)  # Simulate charger response time
        
        try:
            # Get the command
            cmd = await db.ocpi_commands.find_one({"id": command_id})
            if not cmd:
                return
            
            # Create session
            session_id = str(uuid.uuid4())
            token = command.get("token", {})
            
            session = {
                "country_code": "NL",
                "party_id": "MCK",  # Mock CPO
                "id": session_id,
                "start_date_time": datetime.utcnow(),
                "end_date_time": None,
                "kwh": 0.0,
                "cdr_token": token,
                "auth_method": "COMMAND",
                "authorization_reference": command.get("authorization_reference"),
                "location_id": command.get("location_id"),
                "evse_uid": command.get("evse_uid"),
                "connector_id": command.get("connector_id"),
                "currency": "EUR",
                "charging_periods": [],
                "total_cost": None,
                "status": "ACTIVE",
                "last_updated": datetime.utcnow()
            }
            
            # Find user from token
            user_token = await db.ocpi_tokens.find_one({"uid": token.get("uid")})
            if user_token:
                session["user_id"] = user_token.get("user_id")
            
            await db.ocpi_sessions.insert_one(session)
            
            # Update command with session reference
            await db.ocpi_commands.update_one(
                {"id": command_id},
                {"$set": {
                    "session_id": session_id,
                    "result": {"result": "ACCEPTED"},
                    "status": "COMPLETED",
                    "updated_at": datetime.utcnow()
                }}
            )
            
            # Start charging simulation
            asyncio.create_task(
                MockCpoSimulator._simulate_charging(db, session_id)
            )
            
            logger.info(f"Mock CPO: Session {session_id} started")
            
        except Exception as e:
            logger.error(f"Mock CPO simulation error: {e}")
    
    @staticmethod
    async def _simulate_session_stop(db: AsyncIOMotorDatabase, command: dict, command_id: str):
        """Simulate the async session stop flow"""
        await asyncio.sleep(2)  # Simulate charger response time
        
        try:
            session_id = command.get("session_id")
            session = await db.ocpi_sessions.find_one({"id": session_id})
            
            if not session:
                logger.error(f"Session {session_id} not found")
                return
            
            # Stop the session
            end_time = datetime.utcnow()
            duration_hours = (end_time - session["start_date_time"]).total_seconds() / 3600
            
            # Calculate final cost
            total_kwh = session.get("kwh", 0)
            energy_cost = total_kwh * 0.35  # €0.35/kWh
            time_cost = duration_hours * 0.05  # €0.05/hour
            total_cost = energy_cost + time_cost
            
            await db.ocpi_sessions.update_one(
                {"id": session_id},
                {"$set": {
                    "status": "COMPLETED",
                    "end_date_time": end_time,
                    "total_cost": {
                        "excl_vat": round(total_cost, 2),
                        "incl_vat": round(total_cost * 1.21, 2)
                    },
                    "last_updated": datetime.utcnow()
                }}
            )
            
            # Update command
            await db.ocpi_commands.update_one(
                {"id": command_id},
                {"$set": {
                    "result": {"result": "ACCEPTED"},
                    "status": "COMPLETED",
                    "updated_at": datetime.utcnow()
                }}
            )
            
            # Generate CDR
            await MockCpoSimulator._generate_cdr(db, session_id)
            
            logger.info(f"Mock CPO: Session {session_id} stopped")
            
        except Exception as e:
            logger.error(f"Mock CPO stop session error: {e}")
    
    @staticmethod
    async def _simulate_charging(db: AsyncIOMotorDatabase, session_id: str):
        """Simulate charging progress with periodic updates"""
        logger.info(f"Mock CPO: Starting charging simulation for {session_id}")
        
        power_kw = 50.0  # 50 kW charger
        
        while True:
            await asyncio.sleep(3)  # Update every 3 seconds
            
            session = await db.ocpi_sessions.find_one({"id": session_id})
            if not session or session.get("status") != "ACTIVE":
                break
            
            # Calculate energy delivered
            elapsed_hours = (datetime.utcnow() - session["start_date_time"]).total_seconds() / 3600
            delivered_kwh = power_kw * elapsed_hours * 0.9  # 90% efficiency
            
            # Running cost
            energy_cost = delivered_kwh * 0.35
            
            # Update session
            await db.ocpi_sessions.update_one(
                {"id": session_id},
                {"$set": {
                    "kwh": round(delivered_kwh, 3),
                    "total_cost": {
                        "excl_vat": round(energy_cost, 2),
                        "incl_vat": round(energy_cost * 1.21, 2)
                    },
                    "last_updated": datetime.utcnow()
                }}
            )
        
        logger.info(f"Mock CPO: Charging simulation ended for {session_id}")
    
    @staticmethod
    async def _generate_cdr(db: AsyncIOMotorDatabase, session_id: str):
        """Generate a CDR for a completed session"""
        session = await db.ocpi_sessions.find_one({"id": session_id})
        if not session:
            return
        
        cdr_id = f"CDR-{uuid.uuid4().hex[:12].upper()}"
        
        duration_hours = 0
        if session.get("end_date_time") and session.get("start_date_time"):
            duration_hours = (session["end_date_time"] - session["start_date_time"]).total_seconds() / 3600
        
        cdr = {
            "country_code": session["country_code"],
            "party_id": session["party_id"],
            "id": cdr_id,
            "start_date_time": session["start_date_time"],
            "end_date_time": session.get("end_date_time", datetime.utcnow()),
            "session_id": session_id,
            "cdr_token": session.get("cdr_token"),
            "auth_method": session.get("auth_method", "COMMAND"),
            "authorization_reference": session.get("authorization_reference"),
            "location_id": session["location_id"],
            "evse_uid": session["evse_uid"],
            "connector_id": session["connector_id"],
            "currency": "EUR",
            "charging_periods": [
                {
                    "start_date_time": session["start_date_time"],
                    "dimensions": [
                        {"type": "ENERGY", "volume": session.get("kwh", 0)},
                        {"type": "TIME", "volume": duration_hours}
                    ]
                }
            ],
            "total_cost": session.get("total_cost", {"excl_vat": 0, "incl_vat": 0}),
            "total_energy": session.get("kwh", 0),
            "total_time": duration_hours,
            "user_id": session.get("user_id"),
            "last_updated": datetime.utcnow()
        }
        
        await db.ocpi_cdrs.insert_one(cdr)
        
        # Update session with CDR reference
        await db.ocpi_sessions.update_one(
            {"id": session_id},
            {"$set": {"cdr_id": cdr_id}}
        )
        
        logger.info(f"Mock CPO: Generated CDR {cdr_id} for session {session_id}")


async def seed_mock_cpo_data(db: AsyncIOMotorDatabase):
    """Seed mock CPO provider and locations"""
    
    # Register mock provider
    mock_provider = {
        "country_code": "NL",
        "party_id": "MCK",
        "name": "Mock CPO Netherlands",
        "base_url": "http://localhost:8001",  # Self for mock
        "token_a": "mock-cpo-token-a",
        "token_b": "mock-cpo-token-b",
        "is_mock": True,
        "roles": ["CPO"]
    }
    
    await db.ocpi_providers.update_one(
        {"country_code": "NL", "party_id": "MCK"},
        {"$set": {
            **mock_provider,
            "created_at": datetime.utcnow(),
            "last_updated": datetime.utcnow()
        }},
        upsert=True
    )
    
    # Create mock tariff
    mock_tariff = {
        "country_code": "NL",
        "party_id": "MCK",
        "id": "TARIFF-STANDARD",
        "currency": "EUR",
        "type": "REGULAR",
        "elements": [
            {
                "price_components": [
                    {"type": "FLAT", "price": 0.50, "step_size": 1},
                    {"type": "ENERGY", "price": 0.35, "step_size": 1},
                    {"type": "TIME", "price": 0.05, "step_size": 60},
                    {"type": "PARKING_TIME", "price": 0.10, "step_size": 60}
                ]
            }
        ],
        "last_updated": datetime.utcnow()
    }
    
    await db.ocpi_tariffs.update_one(
        {"country_code": "NL", "party_id": "MCK", "id": "TARIFF-STANDARD"},
        {"$set": mock_tariff},
        upsert=True
    )
    
    # Create OCPI locations from existing stations
    stations = await db.stations.find().to_list(100)
    
    for station in stations:
        chargers = await db.chargers.find({"station_id": station["id"]}).to_list(20)
        
        evses = []
        for charger in chargers:
            connector_standard = "IEC_62196_T2"  # Type 2
            power_type = "AC_3_PHASE"
            
            if charger.get("connector_type") == "CCS":
                connector_standard = "IEC_62196_T2_COMBO"
                power_type = "DC"
            elif charger.get("connector_type") == "CHAdeMO":
                connector_standard = "CHADEMO"
                power_type = "DC"
            
            evse = {
                "uid": charger["id"],
                "evse_id": f"NL*MCK*E{charger['id'][-4:].upper()}",
                "status": charger.get("status", "AVAILABLE"),
                "connectors": [
                    {
                        "id": "1",
                        "standard": connector_standard,
                        "format": "CABLE",
                        "power_type": power_type,
                        "max_voltage": 400 if power_type == "DC" else 230,
                        "max_amperage": int(charger.get("max_kw", 22) * 1000 / 400),
                        "max_electric_power": int(charger.get("max_kw", 22) * 1000),
                        "tariff_ids": ["TARIFF-STANDARD"],
                        "last_updated": datetime.utcnow()
                    }
                ],
                "last_updated": datetime.utcnow()
            }
            evses.append(evse)
        
        ocpi_location = {
            "country_code": "NL",
            "party_id": "MCK",
            "id": station["id"],
            "publish": True,
            "name": station["name"],
            "address": station["address"],
            "city": "Rotterdam",
            "postal_code": "3000 AA",
            "country": "NLD",
            "coordinates": {
                "latitude": str(station["latitude"]),
                "longitude": str(station["longitude"])
            },
            "evses": evses,
            "operator": {
                "name": "Mock CPO Netherlands"
            },
            "time_zone": "Europe/Amsterdam",
            "last_updated": datetime.utcnow()
        }
        
        await db.ocpi_locations.update_one(
            {"country_code": "NL", "party_id": "MCK", "id": station["id"]},
            {"$set": ocpi_location},
            upsert=True
        )
    
    logger.info(f"Seeded {len(stations)} OCPI locations for mock CPO")
