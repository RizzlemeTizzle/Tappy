# RFID Token Management - Tappy Charge

## Overzicht

Dit document beschrijft de RFID laadpas/druppel ondersteuning met OCPI 2.2.1 integratie.

## Database Schema

### RfidToken
```prisma
model RfidToken {
  id              String    @id
  uid             String    @unique  // RFID UID (hex)
  contractId      String    @unique  // CTP-NL-2025-000001
  visualNumber    String?             // **** 1234
  type            String              // RFID, APP_USER, AD_HOC_USER
  status          String              // ACTIVE, BLOCKED, EXPIRED, PENDING
  whitelist       String              // ALWAYS, ALLOWED, ALLOWED_OFFLINE, NEVER
  userId          String?             // Gekoppelde gebruiker
  validFrom       DateTime
  validUntil      DateTime?
  usageCount      Int
  lastUsedAt      DateTime?
}
```

### TokenAuditLog
Houdt alle wijzigingen bij voor compliance en debugging.

### CpoTokenConfig
Per-CPO configuratie voor rate limits, IP allowlist, en toegestane token types.

## OCPI eMSP Tokens Endpoints

### GET /api/ocpi/emsp/2.2.1/tokens/{country_code}/{party_id}/{token_uid}
CPO haalt token informatie op.

**Headers:**
```
Authorization: Token <cpo_token>
```

**Response:**
```json
{
  "data": {
    "country_code": "NL",
    "party_id": "CTP",
    "uid": "04A2B3C4D5E6F7",
    "type": "RFID",
    "contract_id": "CTP-NL-2025-000001",
    "valid": true,
    "whitelist": "ALWAYS",
    "last_updated": "2025-01-15T10:30:00Z"
  },
  "status_code": 1000,
  "status_message": "Success"
}
```

### POST /api/ocpi/emsp/2.2.1/tokens/{token_uid}/authorize
Real-time autorisatie verzoek van CPO.

**Request:**
```json
{
  "location_id": "LOC001",
  "evse_uid": "NL*CTP*E00001*1"
}
```

**Response:**
```json
{
  "data": {
    "allowed": "ALLOWED",
    "token": { ... },
    "authorization_reference": "AUTH-1234567890-04A2B3C4"
  },
  "status_code": 1000
}
```

**Allowed waarden:**
- `ALLOWED` - Autorisatie geslaagd
- `BLOCKED` - Token geblokkeerd
- `EXPIRED` - Token verlopen
- `NO_CREDIT` - Geen betaalmethode
- `NOT_ALLOWED` - Niet toegestaan
- `UNKNOWN` - Token niet gevonden

## Admin API Endpoints

### Token Management

| Endpoint | Methode | Beschrijving |
|----------|---------|--------------|
| `/api/admin/tokens` | GET | Lijst alle tokens |
| `/api/admin/tokens/:id` | GET | Token details |
| `/api/admin/tokens` | POST | Nieuwe token |
| `/api/admin/tokens/:id` | PATCH | Update token |
| `/api/admin/tokens/:id/assign` | POST | Toewijzen aan user |
| `/api/admin/tokens/:id/unassign` | POST | Loskoppelen van user |
| `/api/admin/tokens/import` | POST | CSV import |
| `/api/admin/tokens/export` | GET | CSV export |
| `/api/admin/tokens/stats` | GET | Statistieken |

### Authenticatie
Basic Auth met admin credentials:
```
Authorization: Basic base64(admin:tappycharge2025)
```

## Admin Portal

Toegang via browser: `http://localhost:8001/admin/tokens`

Features:
- Dashboard met statistieken
- Token lijst met zoeken en filteren
- Token details met audit log
- Nieuwe token aanmaken
- CSV import/export
- Block/unblock tokens
- Toewijzen aan gebruikers

## CSV Import Formaat

### Kolommen
| Kolom | Verplicht | Beschrijving |
|-------|-----------|--------------|
| `rfid_uid` | Ja | RFID UID (hex, spaties/colons worden verwijderd) |
| `user_email` | Nee | E-mail van gebruiker om aan te koppelen |
| `visual_number` | Nee | Gemaskeerd nummer voor display |

### Voorbeeld CSV
```csv
rfid_uid,user_email,visual_number
04A2B3C4D5E6F7,john@example.com,**** 1234
04B3C4D5E6F7A8,jane@example.com,**** 5678
04C4D5E6F7A8B9,,
```

### Import via CLI
```bash
curl -X POST http://localhost:8001/api/admin/tokens/import \
  -H "Authorization: Basic YWRtaW46Y2hhcmdldGFwMjAyNQ==" \
  -H "Content-Type: application/json" \
  -d '{
    "csv": "rfid_uid,user_email\n04A2B3C4D5E6F7,user@example.com",
    "whitelist": "ALWAYS",
    "group_id": "BATCH-2025-01"
  }'
```

## Whitelist Strategieën

| Strategie | Beschrijving |
|-----------|--------------|
| `ALWAYS` | Token altijd geldig, geen real-time check nodig |
| `ALLOWED` | Vereist real-time autorisatie bij CPO |
| `ALLOWED_OFFLINE` | Offline ook toegestaan (cache bij CPO) |
| `NEVER` | Altijd real-time check vereist |

## CPO Configuratie

Per CPO kunnen de volgende instellingen worden geconfigureerd:
- `allowedTypes` - Welke token types deze CPO mag opvragen
- `rateLimit` - Max requests per minuut
- `ipAllowlist` - Toegestane IP adressen
- `realTimeAuth` - Real-time autorisatie toestaan
- `pullTokens` - Token pull toestaan
- `pushUpdates` - Push updates naar CPO

## Security

- Geen PII (persoonlijk identificeerbare informatie) in OCPI responses
- HMAC signed requests (optioneel)
- Rate limiting per CPO
- IP allowlist per CPO
- Audit logging van alle wijzigingen
- Basic auth voor admin portal

## Error Codes

| Code | Beschrijving |
|------|--------------|
| 1000 | Success |
| 2000 | Generic client error |
| 2001 | Invalid or missing authentication |
| 2003 | Unknown eMSP |
| 2004 | Token not found |
| 3001 | Rate limit exceeded |

## Environment Variables

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=tappycharge2025
OCPI_COUNTRY_CODE=NL
OCPI_PARTY_ID=CTP
```
