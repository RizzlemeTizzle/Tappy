# ChargeTap - Product Requirements Document

## Original Problem Statement
Build a "ChargeTap" mobile app for EV charging with NFC tap-to-pay, transparent pricing, and a live session view.

## Core Features

### Implemented ✅
1. **Authentication System**
   - User registration and login with JWT tokens
   - Payment method management (mocked Stripe)

2. **Station Discovery**
   - Map-based station finder with filters
   - Nearby stations with distance calculation
   - Viewport-based station loading

3. **Charging Session Management**
   - Start/stop charging sessions
   - Live session monitoring with real-time updates
   - Pricing snapshots locked at session start
   - Penalty/idle fee calculation

4. **NFC Tap-to-Pay** (Simulated)
   - NFC payload resolution
   - Charger connection via NFC tap

5. **QR Code Start** ✅
   - QR code scanning via camera
   - Deep linking support (chargetap://start/...)
   - QR code generation tooling

6. **RFID Token Support** ✅
   - Admin API for RFID token management
   - OCPI 2.2.1 token authorization endpoints

7. **Phone-as-Card (HCE)** ✅ NEW
   - Backend API endpoints for NFC token provisioning
   - Token activation/deactivation
   - Tap recording and usage tracking
   - Native Android HCE module (Kotlin) - requires `expo prebuild`
   - Frontend setup wizard with Dutch localization

## Technical Architecture

### Backend (Python/FastAPI/MongoDB)
- **Port**: 8001
- **API Prefix**: /api
- **Database**: MongoDB (chargetap_db)

### Frontend (React Native/Expo)
- **Framework**: Expo with expo-router
- **State Management**: Zustand
- **Styling**: React Native StyleSheet (dark theme)

### Key Files
- `/app/backend/server.py` - Main API server
- `/app/frontend/app/` - Expo Router pages
- `/app/frontend/src/store/` - Zustand stores
- `/app/frontend/android-hce-module/` - Native HCE code

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/users/me` - Get current user

### NFC HCE Tokens ✅ NEW
- `POST /api/nfc/tokens/provision` - Create new HCE token
- `GET /api/nfc/tokens/status` - Get token status
- `POST /api/nfc/tokens/activate` - Activate token for HCE
- `POST /api/nfc/tokens/deactivate` - Disable HCE
- `GET /api/nfc/tokens/active-uid` - Get active token UID
- `POST /api/nfc/tokens/tap` - Record tap event

### Stations & Chargers
- `GET /api/stations` - List all stations
- `GET /api/stations/nearby` - Get nearby stations
- `GET /api/stations/{id}` - Get station details

### Sessions
- `POST /api/sessions/start` - Start charging
- `POST /api/sessions/{id}/stop` - Stop charging
- `GET /api/sessions/{id}` - Get session status

## Database Models

### NfcToken (New)
```python
{
  "id": "uuid",
  "uid": "16-char-hex",  # CT + 6 random bytes
  "contract_id": "CTP-NFC-YYYY-NNNNNN",
  "user_id": "uuid",
  "device_id": "string",
  "status": "ACTIVE|BLOCKED|EXPIRED",
  "hce_enabled": bool,
  "is_active": bool,
  "tap_count": int,
  "last_tap_at": datetime
}
```

## Future Tasks (Prioritized)

### P0 - Critical
- [ ] Test HCE on physical Android device with NFC reader

### P1 - High Priority
- [ ] Admin UI for token management
- [ ] Token rotation with grace period
- [ ] OCPI integration for HCE tokens

### P2 - Medium Priority
- [ ] QR Code replay protection (nonce+ttl)
- [ ] Full map filters/sorting UI
- [ ] Unit tests for critical backend logic

### P3 - Low Priority
- [ ] iOS NFC support (background tag reading)
- [ ] Multi-language support
- [ ] Push notifications

## Mocked/Simulated Features
- **Stripe payments** - Uses mock payment intents
- **Charger behavior** - Simulated via `chargerSimulator`
- **NFC tap** - Simulated in preview (real HCE requires native build)

## Setup Notes

### HCE Activation (Android Only)
1. Run `npx expo prebuild --platform android`
2. Copy files from `/app/frontend/android-hce-module/`
3. Update AndroidManifest.xml with HCE service
4. Build APK and test on physical device

---
*Last Updated: February 21, 2026*
