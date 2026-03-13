# NFC Host Card Emulation (HCE) - Tappy Charge

## Overzicht

Deze module implementeert NFC "phone-as-card" functionaliteit voor Android devices, waarmee gebruikers hun telefoon kunnen gebruiken als laadpas bij EV laadpalen.

## Architectuur

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Laadpaal NFC  │     │  Android Phone  │     │  Tappy Charge API  │
│     Reader     │<--->|   HCE Service   │<--->|   OCPI Tokens   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                    │                         │
        │ ISO 14443-4        │ HTTPS                   │
        │ (ISO-DEP)          │                         │
        v                    v                         v
   APDU Commands      Token UID (8 bytes)      OCPI Authorization
```

## ⚠️ BELANGRIJKE BEPERKINGEN

### HCE vs MIFARE UID - Reality Check

| Aspect | MIFARE (fysieke kaart) | HCE (telefoon) |
|--------|----------------------|----------------|
| UID Type | 4/7/10 byte hardware UID | Geen echte UID |
| Protocol | ISO 14443-3 (MIFARE) | ISO 14443-4 (ISO-DEP) |
| Reader Support | Universeel | Alleen ISO-DEP readers |
| Emulatie | - | Kan MIFARE UID NIET emuleren |

### Compatibiliteit met Laadpalen

**Werkt WEL met:**
- Moderne laadpalen met ISO-DEP ondersteuning
- Readers geconfigureerd voor ISO 14443-4
- Systemen die AID-based selectie ondersteunen

**Werkt NIET met:**
- Oude MIFARE-only readers
- Systemen die alleen UID lezen (geen APDU)
- Proprietary NFC protocols

### Geschatte Compatibiliteit
- **~40-60%** van nieuwe laadpaal installaties (2020+)
- **~10-20%** van oudere installaties
- Sterk afhankelijk van CPO configuratie

## Token Formaat

### UID Structuur (8 bytes)
```
43 54 XX XX XX XX XX XX
└┴┘ └───────────────┘
"CT"  6 random bytes
```

- Prefix `CT` (0x4354) = "Tappy Charge" identifier
- 6 random bytes voor uniciteit
- Totaal: 16 hex karakters (8 bytes)

### Voorbeeld
```
Token UID:    43541A2B3C4D5E6F
Contract ID:  CTP-NFC-2025-000001
Visual:       **** 5E6F
```

## API Endpoints

### Token Provisioning

| Endpoint | Method | Beschrijving |
|----------|--------|-------------|
| `/api/v1/tokens/nfc/provision` | POST | Nieuwe HCE token aanmaken |
| `/api/v1/tokens/nfc/status` | GET | Token status ophalen |
| `/api/v1/tokens/nfc/active` | POST | Token activeren voor HCE |
| `/api/v1/tokens/nfc/disable` | POST | HCE uitschakelen |
| `/api/v1/tokens/nfc/rotate` | POST | Token UID roteren |
| `/api/v1/tokens/nfc/tap` | POST | Tap event registreren |

### OCPI Integratie

| Endpoint | Method | Beschrijving |
|----------|--------|-------------|
| `/api/ocpi/emsp/2.2.1/tokens/hce/:uid` | GET | Token info voor CPO |
| `/api/ocpi/emsp/2.2.1/tokens/hce/:uid/authorize` | POST | Real-time autorisatie |

## Android HCE Implementatie

### AID Configuratie
```xml
<!-- F0 + "Tappy Charge" in hex = F0436861726765546170 -->
<aid-group android:category="other" android:description="@string/aid_description">
    <aid-filter android:name="F0436861726765546170" />
</aid-group>
```

### APDU Commands

| Command | Description | Response |
|---------|-------------|---------|
| `00 A4 04 00 0A F0436861726765546170` | SELECT AID | `90 00` (success) |
| `00 B0 00 00 08` | READ BINARY | `<8-byte UID> 90 00` |
| `00 CA 00 00` | GET DATA | `<UID> 90 00` |

### Kotlin Service
```kotlin
class TappyChargeHceService : HostApduService() {
    override fun processCommandApdu(commandApdu: ByteArray, extras: Bundle?): ByteArray {
        // Parse command and return token UID
    }
}
```

## Security

### Maatregelen
- ✅ Device binding (token gekoppeld aan device ID)
- ✅ Root detection (HCE geblokkeerd op geroote devices)
- ✅ Android Keystore voor token opslag
- ✅ Token rotatie (optioneel, feature flag)
- ✅ Audit logging van alle acties

### Root Detection
```kotlin
fun isDeviceRooted(): Boolean {
    // Check for su binary
    // Check for root management apps
    // Check system properties
}
```

## Token Rotatie

Wanneer ingeschakeld (`NFC_TOKEN_ROTATION=true`):

1. Nieuwe UID wordt gegenereerd
2. Oude UID blijft geldig tijdens grace period (default: 24 uur)
3. Na grace period wordt oude UID ongeldig
4. CPO krijgt beide UIDs via OCPI

```
Timeline:
|-------- Old UID valid --------|---- Old UID expired ----|
|          New UID valid from rotation point               |
                                |
                          Grace period ends
```

## Troubleshooting

### HCE werkt niet
1. **Check NFC status**: Is NFC aan op het device?
2. **Check HCE support**: Niet alle devices ondersteunen HCE
3. **Check default payment app**: Soms conflicteert dit
4. **Reader compatibiliteit**: Ondersteunt de reader ISO-DEP?

### Token niet herkend door laadpaal
1. **Protocol mismatch**: Laadpaal verwacht mogelijk MIFARE
2. **AID niet geconfigureerd**: CPO moet onze AID whitelisten
3. **Timeout**: HCE response te langzaam

### Fallback Opties
Als HCE niet werkt:
1. **QR-Start**: Scan QR code op laadpaal
2. **Remote Start**: Start via app (OCPI Commands)
3. **Fysieke RFID kaart**: Bestel Tappy Charge laadpas

## Environment Variables

```env
# Feature flags
NFC_TOKEN_ROTATION=false
NFC_TOKEN_ROTATION_DAYS=30
NFC_TOKEN_GRACE_HOURS=24

# OCPI
OCPI_COUNTRY_CODE=NL
OCPI_PARTY_ID=CTP
```

## Database Schema

```prisma
model NfcToken {
  id              String    @id
  uid             String    @unique  // 8-byte hex
  contractId      String    @unique
  userId          String
  deviceId        String    // Android device binding
  hceEnabled      Boolean
  isActive        Boolean
  status          String    // ACTIVE, BLOCKED, EXPIRED
  tapCount        Int
  lastTapAt       DateTime?
}
```

## iOS Beperkingen

iOS ondersteunt GEEN HCE voor custom applicaties:
- Apple beperkt NFC emulatie tot Apple Pay/Wallet
- Geen HostApduService equivalent
- **Fallback vereist**: QR-Start of Remote Start

De app detecteert iOS en toont automatisch alternatieve opties.
