# ChargeTap - Product Requirements Document

## Original Problem Statement
Build a "ChargeTap" mobile app for EV charging with NFC tap-to-pay, transparent pricing, and a live session view.

## Core Features

### Implemented ✅
1. **Authentication System**
   - User registration and login with JWT tokens
   - Payment method management (mocked Stripe)
   - **Guest Mode** - Browse without account ✅ NEW

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

8. **Guest Mode** ✅ NEW
   - "Browse without logging in" option on onboarding
   - Full access to: map, station list, pricing, charger availability
   - Blocked from: starting sessions, session history, profile, payments
   - LoginWall component for gated features (Dutch localized)
   - Guest banner on Tap screen with login prompt
   - Capability-based permission system

## Guest Mode Architecture

### Capabilities System
```typescript
type Capability = 
  | 'CAN_VIEW_PUBLIC_DATA'    // guest: true
  | 'CAN_START_SESSION'       // guest: false
  | 'CAN_STOP_SESSION'        // guest: false
  | 'CAN_VIEW_HISTORY'        // guest: false
  | 'CAN_MANAGE_PAYMENT'      // guest: false
  | 'CAN_VIEW_PROFILE';       // guest: false
```

### Guest Mode Features
- **Available**: Find chargers, view pricing, station details, charger status
- **Partially Available**: Tap screen (can view pricing, cannot start session)
- **Blocked**: Sessions history, Profile, Payment methods, Start/Stop charging

### Components
- `LoginWall.tsx` - Reusable modal for login prompts
- `InlineLoginWall` - Embedded login wall for tabs
- `GuestBlockedButton` - Button wrapper for auth-required actions

## Technical Architecture

### Backend (Python/FastAPI/MongoDB)
- **Port**: 8001
- **API Prefix**: /api
- **Database**: MongoDB (chargetap_db)

### Public Endpoints (no auth required)
- `GET /api/stations` - List all stations
- `GET /api/stations/nearby` - Get nearby stations
- `GET /api/stations/{id}` - Get station details
- `POST /api/nfc/resolve` - Resolve NFC payload

### Auth-Required Endpoints
- `POST /api/sessions/start` - Start charging
- `POST /api/sessions/{id}/stop` - Stop charging
- `GET /api/sessions/user/history` - Session history
- Payment endpoints

## Bug Fixes Completed (Feb 21, 2026)

### Bug 1: Receipt Done Navigation ✅
- **Fix**: Changed navigation to `/(tabs)/tap`

### Bug 2: Phone-as-Card Double Header ✅
- **Fix**: Single header with fixed button container

### Bug 3: New Account Navigation ✅
- **Fix**: Register/Login now navigate to `/(tabs)/tap`

## Test Results
- **Backend**: 100% (16/16 tests passed)
- **Frontend**: 100% (all guest mode features verified)
- **Test Report**: `/app/test_reports/iteration_2.json`

## Test Credentials
- **Email**: hce-test@example.com
- **Password**: test123

## Future Tasks (Prioritized)

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
- [ ] Guest favorites (local storage)

## Mocked/Simulated Features
- **Stripe payments** - Uses mock payment intents
- **Charger behavior** - Simulated via `chargerSimulator`
- **NFC tap** - Simulated in preview (real HCE requires native build)

---
*Last Updated: February 21, 2026*
