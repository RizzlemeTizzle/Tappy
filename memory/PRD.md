# ChargeTap - Product Requirements Document

## Project Overview
ChargeTap is a mobile EV charging application built with React Native (Expo) frontend and Python/FastAPI/MongoDB backend. The app enables users to find charging stations, start charging sessions via NFC tap, and manage their charging history and payments.

## Core Features

### Implemented (Completed)
1. **User Authentication**
   - JWT-based authentication
   - Login/Registration flow
   - Guest Mode (browse without account)
   
2. **Station Discovery**
   - Map-based station finder
   - Station search and filtering
   - Pricing transparency display
   - Station details view

3. **Charging Flow**
   - NFC tap simulation
   - Pricing confirmation
   - Live session tracking
   - Receipt generation

4. **Profile & Settings**
   - User profile management
   - Payment method management (mocked)
   - **Language Switcher (NEW)** - 10 languages supported

5. **Guest Mode**
   - Browse stations without login
   - View pricing without login
   - LoginWall components for gated features

6. **Internationalization (i18n)** ✅ COMPLETED (Dec 2025)
   - Full multilingual support for 10 languages:
     - English (en)
     - Dutch (nl)
     - German (de)
     - French (fr)
     - Italian (it)
     - Spanish (es)
     - Swedish (sv)
     - Finnish (fi)
     - Danish (da)
     - Norwegian (nb)
   - Automatic device locale detection
   - In-app language switcher
   - Localized currency, number, and date formatting
   - All screens fully translated:
     - phone-as-card (setup, activation, complete)
     - pricing-confirmation
     - live-session
     - receipt
     - add-payment
     - onboarding
     - login/register
     - profile with language switcher
     - tap, find, sessions tabs

7. **Phone-as-Card (HCE)**
   - Backend NFC token management APIs
   - UI for token setup
   - Requires native Android testing

8. **Notification System** ✅ COMPLETED (Dec 2025)
   - **Backend**:
     - Device registration/deregistration endpoints
     - Notification preferences endpoints (GET/PUT)
     - Notification log storage
     - Event-driven notification sending on session lifecycle
     - Scheduled penalty notifications (prealert + started)
     - All 11 notification types implemented
     - Mocked FCM push (logs only, ready for Firebase integration)
   - **Frontend**:
     - expo-notifications integration
     - Notification Settings screen with toggles
     - Permission flow
     - Local notification scheduling
     - Deep link handling structure
   - **Notification Types**:
     - SESSION_STARTED, SESSION_START_FAILED, SESSION_STOPPED, SESSION_INTERRUPTED
     - CHARGING_COMPLETE
     - PENALTY_STARTS_SOON, PENALTY_STARTED, PENALTY_CAP_REACHED
     - PAYMENT_SUCCEEDED, PAYMENT_FAILED
     - COST_MILESTONE (optional)
   - **i18n**: All 10 languages supported for notification content
   - **Guest Mode**: Local notifications work for guests, push requires login

### In Progress / Upcoming
- [ ] **HCE Frontend Integration** - Connect frontend to backend NFC APIs
- [ ] **Stripe Payment Integration** - Currently mocked

### Future Tasks (Backlog)
- [ ] Admin UI for Token Management
- [ ] QR Code Replay Protection
- [ ] Full Map Filters/Sorting
- [ ] Unit Tests

## Technical Architecture

### Frontend
- **Framework**: React Native with Expo
- **Router**: Expo Router (file-based)
- **State Management**: Zustand
- **i18n**: i18next + react-i18next
- **UI Components**: Custom components + Ionicons

### Backend
- **Framework**: FastAPI (Python)
- **Database**: MongoDB
- **Authentication**: JWT tokens

### Key Files
```
/app
├── backend/
│   └── app/main.py          # FastAPI routes including NFC endpoints
├── frontend/
│   ├── app/                  # Expo Router screens
│   │   ├── (tabs)/           # Tab screens (find, tap, sessions, profile)
│   │   ├── _layout.tsx       # Root layout with i18n import
│   │   └── ...
│   └── src/
│       ├── i18n/
│       │   ├── index.ts      # i18n configuration
│       │   └── locales/      # Translation JSON files
│       ├── components/
│       │   └── LoginWall.tsx # Guest mode component
│       └── store/            # Zustand stores
```

## API Endpoints
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/stations` - List stations
- `GET /api/stations/{id}` - Station details
- `POST /api/sessions/start` - Start charging session
- `POST /api/sessions/{id}/stop` - Stop charging session
- `GET /api/sessions/history` - User session history
- `POST /api/nfc-tokens` - Create NFC token
- `PUT /api/nfc-tokens/{id}/activate` - Activate token
- `PUT /api/nfc-tokens/{id}/deactivate` - Deactivate token
- `POST /api/devices/register` - Register device for notifications
- `POST /api/devices/deregister` - Deregister device
- `GET /api/me/notification-preferences` - Get notification preferences
- `PUT /api/me/notification-preferences` - Update notification preferences
- `GET /api/me/notification-logs` - Get notification history
- `POST /api/simulate/notification/{type}` - Simulate notification (testing)

## Notes
- Stripe integration is MOCKED
- HCE feature requires physical Android device with NFC for testing
- Backend runs on Python/FastAPI/MongoDB (not Node.js as originally planned)
