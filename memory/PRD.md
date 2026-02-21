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

7. **Phone-as-Card (HCE)** ✅
   - Backend API endpoints for NFC token provisioning
   - Token activation/deactivation
   - Tap recording and usage tracking
   - Native Android HCE module (Kotlin) - requires `expo prebuild`
   - Frontend setup wizard with Dutch localization
   - **BUG FIXED**: Single header, visible CTA button

8. **Receipt Navigation** ✅
   - **BUG FIXED**: Done button navigates to correct home screen with bottom menu

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

### NFC HCE Tokens ✅
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

## Bug Fixes Completed (Feb 21, 2026)

### Bug 1: Receipt Done Navigation ✅
- **Issue**: Done button navigated to old UI without bottom menu
- **Fix**: Changed `router.replace('/ready-to-tap')` to `router.replace('/(tabs)/tap')`
- **File**: `/app/frontend/app/receipt.tsx`

### Bug 2: Phone-as-Card Double Header ✅
- **Issue**: Two headers causing CTA button to be off-screen
- **Fix**: Set `headerShown: false` in _layout.tsx, implemented custom header with fixed button container
- **Files**: `/app/frontend/app/_layout.tsx`, `/app/frontend/app/phone-as-card.tsx`

## Future Tasks (Prioritized)

### P0 - Critical
- [x] ~~Test HCE on physical Android device~~ (Requires user testing)

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

## Test Credentials
- **Email**: hce-test@example.com
- **Password**: test123

---
*Last Updated: February 21, 2026*
