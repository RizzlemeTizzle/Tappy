# Tappy Charge QR Code Generator

CLI tool voor het genereren van gesigneerde QR codes voor EV laadstations.

## Installatie

```bash
cd /app/tools/qr-generator
npm install
```

## QR Code Formaat

### Schema

```
tappycharge://start?v=1&evse_uid=NL*CTP*E00001*1&connector_id=1&loc_id=station-001&cpo=CTP&sig=abc123def456
```

### Parameters

| Parameter | Vereist | Beschrijving |
|-----------|---------|-------------|
| `v` | Ja | Versie (momenteel: 1) |
| `evse_uid` | Ja | OCPI EVSE identifier |
| `connector_id` | Ja | Connector nummer |
| `loc_id` | Ja | Locatie/station ID |
| `cpo` | Ja | Charge Point Operator code |
| `ts` | Nee | Unix timestamp (voor replay protection) |
| `nonce` | Nee | Random nonce (voor replay protection) |
| `sig` | Ja | HMAC-SHA256 signature (base64url, 16 chars) |

### Signature Berekening

```javascript
const dataString = `v=${v}&evse_uid=${evse_uid}&connector_id=${connector_id}&loc_id=${loc_id}&cpo=${cpo}`;
const signature = HMAC_SHA256(dataString, SECRET).substring(0, 16);
```

## Gebruik

### Enkele QR code genereren

```bash
node generate.js single \
  --evse "NL*CTP*E00001*1" \
  --connector "1" \
  --location "station-001" \
  --cpo "CTP" \
  --output ./qrcodes
```

### Met replay protection (QR verloopt na 5 minuten)

```bash
node generate.js single \
  --evse "NL*CTP*E00001*1" \
  --connector "1" \
  --location "station-001" \
  --replay
```

### Alle chargers van een station

```bash
node generate.js station \
  --station "station-001" \
  --output ./qrcodes
```

### Signature verifiëren

```bash
node generate.js verify \
  --payload "v=1&evse_uid=NL*CTP*E00001*1&connector_id=1&loc_id=station-001&cpo=CTP&sig=abc123"
```

## Output

Voor elke QR code worden gegenereerd:
- `qr_<evse_uid>_<connector>.png` - QR code afbeelding
- `qr_<evse_uid>_<connector>.json` - Metadata met payload en URLs

### Voorbeeld Output

```
./qrcodes/
├── station-001/
│   ├── qr_charger-001-a.png
│   ├── qr_charger-001-b.png
│   └── manifest.json
└── qr_NL_CTP_E00001_1_1.png
```

## Voorbeelden QR Payloads

### Standaard (permanent)

```
tappycharge://start?v=1&evse_uid=NL*CTP*E00001*1&connector_id=1&loc_id=station-001&cpo=CTP&sig=XyZ789AbCdEf12
```

### Met Replay Protection

```
tappycharge://start?v=1&evse_uid=NL*CTP*E00001*1&connector_id=1&loc_id=station-001&cpo=CTP&ts=1771704000&nonce=a1b2c3d4&sig=QwErTy123456Ab
```

### HTTPS Fallback

```
https://tappycharge.app/start?v=1&evse_uid=NL*CTP*E00001*1&connector_id=1&loc_id=station-001&cpo=CTP&sig=XyZ789AbCdEf12
```

## Environment Variables

| Variable | Default | Beschrijving |
|----------|---------|-------------|
| `QR_SIGNING_SECRET` | `tappycharge-qr-secret-key-2025` | HMAC signing secret |
| `API_URL` | `http://localhost:8001` | Backend API URL |

## Security

- **HMAC Signature**: Voorkomt QR spoofing
- **Replay Protection**: Optionele TTL van 5 minuten
- **Geen gevoelige data**: Alleen IDs in QR, geen tokens/credentials
- **Per-provider secrets**: Ondersteunt verschillende secrets per CPO
