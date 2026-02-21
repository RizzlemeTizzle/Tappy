"""
OCPI 2.2.1 Module Implementation for ChargeTap
===============================================
This module implements the eMSP (e-Mobility Service Provider) role.

OCPI Modules:
- Credentials: Authenticate with CPO partners
- Locations: Receive charger locations from CPOs
- Tokens: Expose user tokens for CPO whitelist
- Commands: Send START/STOP commands to CPOs
- Sessions: Receive live session updates
- CDRs: Receive charge detail records
- Tariffs: Receive pricing information
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum
import uuid


# ==================== OCPI ENUMS ====================

class OcpiStatus(str, Enum):
    AVAILABLE = "AVAILABLE"
    BLOCKED = "BLOCKED"
    CHARGING = "CHARGING"
    INOPERATIVE = "INOPERATIVE"
    OUTOFORDER = "OUTOFORDER"
    PLANNED = "PLANNED"
    REMOVED = "REMOVED"
    RESERVED = "RESERVED"
    UNKNOWN = "UNKNOWN"


class OcpiConnectorType(str, Enum):
    CHADEMO = "CHADEMO"
    CHAOJI = "CHAOJI"
    DOMESTIC_A = "DOMESTIC_A"
    DOMESTIC_B = "DOMESTIC_B"
    DOMESTIC_C = "DOMESTIC_C"
    DOMESTIC_D = "DOMESTIC_D"
    DOMESTIC_E = "DOMESTIC_E"
    DOMESTIC_F = "DOMESTIC_F"
    DOMESTIC_G = "DOMESTIC_G"
    DOMESTIC_H = "DOMESTIC_H"
    DOMESTIC_I = "DOMESTIC_I"
    DOMESTIC_J = "DOMESTIC_J"
    DOMESTIC_K = "DOMESTIC_K"
    DOMESTIC_L = "DOMESTIC_L"
    GBT_AC = "GBT_AC"
    GBT_DC = "GBT_DC"
    IEC_60309_2_single_16 = "IEC_60309_2_single_16"
    IEC_60309_2_three_16 = "IEC_60309_2_three_16"
    IEC_60309_2_three_32 = "IEC_60309_2_three_32"
    IEC_60309_2_three_64 = "IEC_60309_2_three_64"
    IEC_62196_T1 = "IEC_62196_T1"
    IEC_62196_T1_COMBO = "IEC_62196_T1_COMBO"
    IEC_62196_T2 = "IEC_62196_T2"
    IEC_62196_T2_COMBO = "IEC_62196_T2_COMBO"
    IEC_62196_T3A = "IEC_62196_T3A"
    IEC_62196_T3C = "IEC_62196_T3C"
    NEMA_5_20 = "NEMA_5_20"
    NEMA_6_30 = "NEMA_6_30"
    NEMA_6_50 = "NEMA_6_50"
    NEMA_10_30 = "NEMA_10_30"
    NEMA_10_50 = "NEMA_10_50"
    NEMA_14_30 = "NEMA_14_30"
    NEMA_14_50 = "NEMA_14_50"
    PANTOGRAPH_BOTTOM_UP = "PANTOGRAPH_BOTTOM_UP"
    PANTOGRAPH_TOP_DOWN = "PANTOGRAPH_TOP_DOWN"
    TESLA_R = "TESLA_R"
    TESLA_S = "TESLA_S"


class OcpiPowerType(str, Enum):
    AC_1_PHASE = "AC_1_PHASE"
    AC_3_PHASE = "AC_3_PHASE"
    DC = "DC"


class OcpiTokenType(str, Enum):
    AD_HOC_USER = "AD_HOC_USER"
    APP_USER = "APP_USER"
    OTHER = "OTHER"
    RFID = "RFID"


class OcpiWhitelist(str, Enum):
    ALWAYS = "ALWAYS"
    ALLOWED = "ALLOWED"
    ALLOWED_OFFLINE = "ALLOWED_OFFLINE"
    NEVER = "NEVER"


class OcpiCommandType(str, Enum):
    CANCEL_RESERVATION = "CANCEL_RESERVATION"
    RESERVE_NOW = "RESERVE_NOW"
    START_SESSION = "START_SESSION"
    STOP_SESSION = "STOP_SESSION"
    UNLOCK_CONNECTOR = "UNLOCK_CONNECTOR"


class OcpiCommandResponseType(str, Enum):
    NOT_SUPPORTED = "NOT_SUPPORTED"
    REJECTED = "REJECTED"
    ACCEPTED = "ACCEPTED"
    UNKNOWN_SESSION = "UNKNOWN_SESSION"


class OcpiCommandResultType(str, Enum):
    ACCEPTED = "ACCEPTED"
    CANCELED_RESERVATION = "CANCELED_RESERVATION"
    EVSE_OCCUPIED = "EVSE_OCCUPIED"
    EVSE_INOPERATIVE = "EVSE_INOPERATIVE"
    FAILED = "FAILED"
    NOT_SUPPORTED = "NOT_SUPPORTED"
    REJECTED = "REJECTED"
    TIMEOUT = "TIMEOUT"
    UNKNOWN_RESERVATION = "UNKNOWN_RESERVATION"


class OcpiSessionStatus(str, Enum):
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    INVALID = "INVALID"
    PENDING = "PENDING"
    RESERVATION = "RESERVATION"


class OcpiAuthMethod(str, Enum):
    AUTH_REQUEST = "AUTH_REQUEST"
    COMMAND = "COMMAND"
    WHITELIST = "WHITELIST"


class OcpiTariffDimensionType(str, Enum):
    ENERGY = "ENERGY"
    FLAT = "FLAT"
    PARKING_TIME = "PARKING_TIME"
    TIME = "TIME"


# ==================== OCPI MODELS ====================

class OcpiGeoLocation(BaseModel):
    latitude: str
    longitude: str


class OcpiDisplayText(BaseModel):
    language: str
    text: str


class OcpiBusinessDetails(BaseModel):
    name: str
    website: Optional[str] = None
    logo: Optional[Dict] = None


class OcpiConnector(BaseModel):
    id: str
    standard: str  # OcpiConnectorType
    format: str  # CABLE or SOCKET
    power_type: str  # OcpiPowerType
    max_voltage: int
    max_amperage: int
    max_electric_power: Optional[int] = None
    tariff_ids: Optional[List[str]] = None
    terms_and_conditions: Optional[str] = None
    last_updated: datetime


class OcpiEvse(BaseModel):
    uid: str
    evse_id: Optional[str] = None
    status: str  # OcpiStatus
    status_schedule: Optional[List[Dict]] = None
    capabilities: Optional[List[str]] = None
    connectors: List[OcpiConnector]
    floor_level: Optional[str] = None
    coordinates: Optional[OcpiGeoLocation] = None
    physical_reference: Optional[str] = None
    directions: Optional[List[OcpiDisplayText]] = None
    parking_restrictions: Optional[List[str]] = None
    images: Optional[List[Dict]] = None
    last_updated: datetime


class OcpiLocation(BaseModel):
    country_code: str
    party_id: str
    id: str
    publish: bool = True
    publish_allowed_to: Optional[List[Dict]] = None
    name: Optional[str] = None
    address: str
    city: str
    postal_code: Optional[str] = None
    state: Optional[str] = None
    country: str
    coordinates: OcpiGeoLocation
    related_locations: Optional[List[Dict]] = None
    parking_type: Optional[str] = None
    evses: Optional[List[OcpiEvse]] = None
    directions: Optional[List[OcpiDisplayText]] = None
    operator: Optional[OcpiBusinessDetails] = None
    suboperator: Optional[OcpiBusinessDetails] = None
    owner: Optional[OcpiBusinessDetails] = None
    facilities: Optional[List[str]] = None
    time_zone: Optional[str] = None
    opening_times: Optional[Dict] = None
    charging_when_closed: Optional[bool] = None
    images: Optional[List[Dict]] = None
    energy_mix: Optional[Dict] = None
    last_updated: datetime


class OcpiToken(BaseModel):
    country_code: str
    party_id: str
    uid: str
    type: str  # OcpiTokenType
    contract_id: str
    visual_number: Optional[str] = None
    issuer: str
    group_id: Optional[str] = None
    valid: bool
    whitelist: str  # OcpiWhitelist
    language: Optional[str] = None
    default_profile_type: Optional[str] = None
    energy_contract: Optional[Dict] = None
    last_updated: datetime


class OcpiPriceComponent(BaseModel):
    type: str  # OcpiTariffDimensionType
    price: float
    vat: Optional[float] = None
    step_size: int


class OcpiTariffElement(BaseModel):
    price_components: List[OcpiPriceComponent]
    restrictions: Optional[Dict] = None


class OcpiTariff(BaseModel):
    country_code: str
    party_id: str
    id: str
    currency: str
    type: Optional[str] = None
    tariff_alt_text: Optional[List[OcpiDisplayText]] = None
    tariff_alt_url: Optional[str] = None
    min_price: Optional[Dict] = None
    max_price: Optional[Dict] = None
    elements: List[OcpiTariffElement]
    start_date_time: Optional[datetime] = None
    end_date_time: Optional[datetime] = None
    energy_mix: Optional[Dict] = None
    last_updated: datetime


class OcpiChargingPeriod(BaseModel):
    start_date_time: datetime
    dimensions: List[Dict]
    tariff_id: Optional[str] = None


class OcpiSession(BaseModel):
    country_code: str
    party_id: str
    id: str
    start_date_time: datetime
    end_date_time: Optional[datetime] = None
    kwh: float
    cdr_token: Dict
    auth_method: str  # OcpiAuthMethod
    authorization_reference: Optional[str] = None
    location_id: str
    evse_uid: str
    connector_id: str
    meter_id: Optional[str] = None
    currency: str
    charging_periods: Optional[List[OcpiChargingPeriod]] = None
    total_cost: Optional[Dict] = None
    status: str  # OcpiSessionStatus
    last_updated: datetime


class OcpiCdr(BaseModel):
    country_code: str
    party_id: str
    id: str
    start_date_time: datetime
    end_date_time: datetime
    session_id: Optional[str] = None
    cdr_token: Dict
    auth_method: str
    authorization_reference: Optional[str] = None
    location_id: str
    evse_uid: str
    connector_id: str
    meter_id: Optional[str] = None
    currency: str
    tariffs: Optional[List[OcpiTariff]] = None
    charging_periods: List[OcpiChargingPeriod]
    signed_data: Optional[Dict] = None
    total_cost: Dict
    total_fixed_cost: Optional[Dict] = None
    total_energy: float
    total_energy_cost: Optional[Dict] = None
    total_time: float
    total_time_cost: Optional[Dict] = None
    total_parking_time: Optional[float] = None
    total_parking_cost: Optional[Dict] = None
    total_reservation_cost: Optional[Dict] = None
    remark: Optional[str] = None
    invoice_reference_id: Optional[str] = None
    credit: Optional[bool] = None
    credit_reference_id: Optional[str] = None
    last_updated: datetime


class OcpiStartSession(BaseModel):
    response_url: str
    token: OcpiToken
    location_id: str
    evse_uid: str
    connector_id: Optional[str] = None
    authorization_reference: Optional[str] = None


class OcpiStopSession(BaseModel):
    response_url: str
    session_id: str


class OcpiCommandResponse(BaseModel):
    result: str  # OcpiCommandResponseType
    timeout: int
    message: Optional[List[OcpiDisplayText]] = None


class OcpiCommandResult(BaseModel):
    result: str  # OcpiCommandResultType
    message: Optional[List[OcpiDisplayText]] = None


class OcpiCredentials(BaseModel):
    token: str
    url: str
    business_details: OcpiBusinessDetails
    party_id: str
    country_code: str
    roles: List[Dict]


# ==================== APP MODELS ====================

class ChargingStartRequest(BaseModel):
    location_id: str
    evse_uid: str
    connector_id: str


class ChargingStopRequest(BaseModel):
    session_id: str


class PriceEstimateRequest(BaseModel):
    location_id: str
    evse_uid: str
    connector_id: str
    estimated_kwh: float = 20.0
    estimated_duration_minutes: int = 60


class PriceEstimate(BaseModel):
    location_id: str
    evse_uid: str
    connector_id: str
    currency: str
    energy_cost_cents: int
    time_cost_cents: int
    parking_cost_cents: int
    flat_cost_cents: int
    total_cost_cents: int
    vat_cents: int
    grand_total_cents: int
    tariff_id: Optional[str] = None
    breakdown: List[Dict]
