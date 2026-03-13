# Android HCE (Host Card Emulation) Module for Tappy Charge

Dit document beschrijft hoe je de HCE functionaliteit activeert voor de Tappy Charge app.

## Vereisten

- Android 4.4 (API level 19) of hoger
- NFC hardware op het apparaat
- Expo prebuild uitgevoerd (`npx expo prebuild`)

## Installatie Stappen

### 1. Prebuild het Expo project

```bash
cd frontend
npx expo prebuild --platform android
```

### 2. Kopieer HCE bestanden

Na prebuild, kopieer de volgende bestanden naar je android project:

```bash
# Kopieer HCE Service
cp android-hce-module/HceService.kt android/app/src/main/java/com/tappycharge/app/

# Kopieer AID resource
cp android-hce-module/aid_list.xml android/app/src/main/res/xml/
```

### 3. Update AndroidManifest.xml

Voeg de volgende permissions en service toe aan `android/app/src/main/AndroidManifest.xml`:

```xml
<!-- Permissions (binnen <manifest>) -->
<uses-permission android:name="android.permission.NFC" />
<uses-feature android:name="android.hardware.nfc.hce" android:required="false" />

<!-- Service (binnen <application>) -->
<service
    android:name=".HceService"
    android:exported="true"
    android:permission="android.permission.BIND_NFC_SERVICE">
    <intent-filter>
        <action android:name="android.nfc.cardemulation.action.HOST_APDU_SERVICE" />
    </intent-filter>
    <meta-data
        android:name="android.nfc.cardemulation.host_apdu_service"
        android:resource="@xml/aid_list" />
</service>
```

### 4. Build en installeer

```bash
cd android
./gradlew assembleRelease
```

## Hoe HCE Werkt

1. **AID Selectie**: Wanneer een NFC lezer de telefoon detecteert, stuurt het een SELECT APDU met de Tappy Charge AID (`F0436861726765546170`)
2. **Token Response**: De HCE service antwoordt met de opgeslagen token UID
3. **Autorisatie**: De laadpaal operator (CPO) verifieert de token via OCPI bij Tappy Charge
4. **Sessie Start**: Bij succesvolle autorisatie start de laadsessie

## Token Formaat

- **UID**: 16-karakter hex string (8 bytes)
- **Prefix**: `4354` ('CT' in ASCII)
- **Formaat**: `4354XXXXXXXXXXXX` waar X = random hex digits

## Testen

1. Activeer HCE in de Tappy Charge app
2. Ga naar een ondersteunde laadpaal
3. Houd je telefoon tegen de NFC lezer
4. De laadsessie zou automatisch moeten starten

## Troubleshooting

### HCE werkt niet
- Controleer of NFC is ingeschakeld in Android instellingen
- Controleer of de app als standaard NFC betaal-app is ingesteld
- Herstart de telefoon

### Token wordt niet herkend
- Controleer of de token is geactiveerd in de app
- Controleer de backend verbinding
- Probeer de token te verversen

## Beveiligingsoverwegingen

- Tokens zijn gekoppeld aan specifieke apparaten
- Tokens kunnen op afstand worden geblokkeerd
- Token rotatie is beschikbaar voor extra beveiliging
- Geroote apparaten worden geblokkeerd
