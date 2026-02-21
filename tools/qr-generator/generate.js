#!/usr/bin/env node
/**
 * ChargeTap QR Code Generator CLI
 * 
 * Generates QR codes for EV charging stations with HMAC signatures.
 * 
 * Usage:
 *   node generate.js --evse NL*CTP*E00001*1 --connector 1 --output ./qrcodes/
 *   node generate.js --station station-001 --output ./qrcodes/
 */

import { program } from 'commander';
import QRCode from 'qrcode';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Configuration
const QR_VERSION = 1;
const DEFAULT_SECRET = process.env.QR_SIGNING_SECRET || 'chargetap-qr-secret-key-2025';
const API_BASE_URL = process.env.API_URL || 'http://localhost:8001';

/**
 * Generate HMAC-SHA256 signature
 */
function generateSignature(payload, secret) {
  const dataString = [
    `v=${payload.v}`,
    `evse_uid=${payload.evse_uid}`,
    `connector_id=${payload.connector_id}`,
    `loc_id=${payload.loc_id}`,
    `cpo=${payload.cpo}`,
    payload.ts ? `ts=${payload.ts}` : '',
    payload.nonce ? `nonce=${payload.nonce}` : '',
  ].filter(Boolean).join('&');
  
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(dataString);
  return hmac.digest('base64url').substring(0, 16);
}

/**
 * Generate QR payload
 */
function generateQRPayload(evseUid, connectorId, locationId, cpo, replayProtection = false) {
  const payload = {
    v: QR_VERSION,
    evse_uid: evseUid,
    connector_id: connectorId,
    loc_id: locationId,
    cpo: cpo,
  };
  
  if (replayProtection) {
    payload.ts = Math.floor(Date.now() / 1000);
    payload.nonce = crypto.randomBytes(4).toString('hex');
  }
  
  const sig = generateSignature(payload, DEFAULT_SECRET);
  return { ...payload, sig };
}

/**
 * Encode payload to query string
 */
function encodePayload(payload) {
  const params = new URLSearchParams();
  params.set('v', String(payload.v));
  params.set('evse_uid', payload.evse_uid);
  params.set('connector_id', payload.connector_id);
  params.set('loc_id', payload.loc_id);
  params.set('cpo', payload.cpo);
  if (payload.ts) params.set('ts', String(payload.ts));
  if (payload.nonce) params.set('nonce', payload.nonce);
  params.set('sig', payload.sig);
  return params.toString();
}

/**
 * Generate QR code image
 */
async function generateQRImage(content, outputPath, options = {}) {
  const qrOptions = {
    type: 'png',
    width: options.size || 400,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
    errorCorrectionLevel: 'M',
  };
  
  await QRCode.toFile(outputPath, content, qrOptions);
  return outputPath;
}

/**
 * Fetch station chargers from API
 */
async function fetchStationChargers(stationId) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/stations/${stationId}`);
    if (!response.ok) {
      throw new Error(`Station not found: ${stationId}`);
    }
    const data = await response.json();
    return data.chargers || [];
  } catch (error) {
    console.error(`Error fetching station: ${error.message}`);
    return null;
  }
}

// CLI Setup
program
  .name('qr-generator')
  .description('Generate ChargeTap QR codes for EV charging stations')
  .version('1.0.0');

program
  .command('single')
  .description('Generate a single QR code')
  .requiredOption('--evse <uid>', 'OCPI EVSE UID (e.g., NL*CTP*E00001*1)')
  .requiredOption('--connector <id>', 'Connector ID')
  .requiredOption('--location <id>', 'Location/Station ID')
  .option('--cpo <code>', 'CPO code', 'CTP')
  .option('--replay', 'Enable replay protection (QR expires in 5 min)', false)
  .option('--output <path>', 'Output directory', './qrcodes')
  .option('--size <pixels>', 'QR code size in pixels', '400')
  .action(async (options) => {
    console.log('\n🔌 ChargeTap QR Generator\n');
    
    // Create output directory
    if (!fs.existsSync(options.output)) {
      fs.mkdirSync(options.output, { recursive: true });
    }
    
    // Generate payload
    const payload = generateQRPayload(
      options.evse,
      options.connector,
      options.location,
      options.cpo,
      options.replay
    );
    
    const queryString = encodePayload(payload);
    const deepLink = `chargetap://start?${queryString}`;
    const fallbackUrl = `https://chargetap.app/start?${queryString}`;
    
    // Generate QR code
    const filename = `qr_${options.evse.replace(/\*/g, '_')}_${options.connector}.png`;
    const outputPath = path.join(options.output, filename);
    
    await generateQRImage(deepLink, outputPath, { size: parseInt(options.size) });
    
    console.log('✅ QR Code generated successfully!');
    console.log(`\n📍 EVSE: ${options.evse}`);
    console.log(`🔌 Connector: ${options.connector}`);
    console.log(`🏢 Location: ${options.location}`);
    console.log(`🏭 CPO: ${options.cpo}`);
    console.log(`\n📱 Deep Link:\n   ${deepLink}`);
    console.log(`\n🌐 Fallback URL:\n   ${fallbackUrl}`);
    console.log(`\n💾 Saved to: ${outputPath}`);
    
    if (options.replay) {
      console.log('\n⚠️  Replay protection enabled - QR expires in 5 minutes!');
    }
    
    // Save metadata
    const metadataPath = outputPath.replace('.png', '.json');
    fs.writeFileSync(metadataPath, JSON.stringify({
      payload,
      deep_link: deepLink,
      fallback_url: fallbackUrl,
      generated_at: new Date().toISOString(),
      replay_protection: options.replay,
    }, null, 2));
    console.log(`📝 Metadata: ${metadataPath}\n`);
  });

program
  .command('station')
  .description('Generate QR codes for all chargers at a station')
  .requiredOption('--station <id>', 'Station ID')
  .option('--cpo <code>', 'CPO code', 'CTP')
  .option('--replay', 'Enable replay protection', false)
  .option('--output <path>', 'Output directory', './qrcodes')
  .option('--size <pixels>', 'QR code size in pixels', '400')
  .action(async (options) => {
    console.log('\n🔌 ChargeTap QR Generator - Station Mode\n');
    console.log(`Fetching chargers for station: ${options.station}...`);
    
    const chargers = await fetchStationChargers(options.station);
    
    if (!chargers || chargers.length === 0) {
      console.error('❌ No chargers found or station does not exist.');
      console.log('\nTip: Make sure the backend is running and the station exists.');
      process.exit(1);
    }
    
    // Create output directory
    const stationDir = path.join(options.output, options.station);
    if (!fs.existsSync(stationDir)) {
      fs.mkdirSync(stationDir, { recursive: true });
    }
    
    console.log(`Found ${chargers.length} charger(s)\n`);
    
    const results = [];
    
    for (const charger of chargers) {
      if (!charger.ocpiEvseUid) {
        console.log(`⚠️  Skipping charger ${charger.id} - no EVSE UID`);
        continue;
      }
      
      const payload = generateQRPayload(
        charger.ocpiEvseUid,
        charger.ocpiConnectorId || '1',
        options.station,
        options.cpo,
        options.replay
      );
      
      const queryString = encodePayload(payload);
      const deepLink = `chargetap://start?${queryString}`;
      
      const filename = `qr_${charger.id}.png`;
      const outputPath = path.join(stationDir, filename);
      
      await generateQRImage(deepLink, outputPath, { size: parseInt(options.size) });
      
      results.push({
        charger_id: charger.id,
        evse_uid: charger.ocpiEvseUid,
        connector_type: charger.connectorType,
        max_kw: charger.maxKw,
        qr_file: filename,
        deep_link: deepLink,
      });
      
      console.log(`✅ ${charger.id} (${charger.connectorType} ${charger.maxKw}kW) -> ${filename}`);
    }
    
    // Save manifest
    const manifestPath = path.join(stationDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify({
      station_id: options.station,
      generated_at: new Date().toISOString(),
      replay_protection: options.replay,
      chargers: results,
    }, null, 2));
    
    console.log(`\n💾 Generated ${results.length} QR codes in: ${stationDir}`);
    console.log(`📝 Manifest: ${manifestPath}\n`);
  });

program
  .command('verify')
  .description('Verify a QR payload signature')
  .requiredOption('--payload <string>', 'QR payload query string')
  .action((options) => {
    console.log('\n🔍 Verifying QR Payload...\n');
    
    try {
      const params = new URLSearchParams(options.payload);
      const payload = {
        v: parseInt(params.get('v') || '0'),
        evse_uid: params.get('evse_uid'),
        connector_id: params.get('connector_id'),
        loc_id: params.get('loc_id'),
        cpo: params.get('cpo'),
        sig: params.get('sig'),
      };
      
      const ts = params.get('ts');
      const nonce = params.get('nonce');
      if (ts) payload.ts = parseInt(ts);
      if (nonce) payload.nonce = nonce;
      
      const { sig, ...payloadWithoutSig } = payload;
      const expectedSig = generateSignature(payloadWithoutSig, DEFAULT_SECRET);
      
      console.log('Payload:', JSON.stringify(payload, null, 2));
      console.log(`\nExpected signature: ${expectedSig}`);
      console.log(`Provided signature: ${sig}`);
      
      if (sig === expectedSig) {
        console.log('\n✅ Signature VALID');
        
        if (payload.ts) {
          const age = Math.floor(Date.now() / 1000) - payload.ts;
          console.log(`⏱️  Age: ${age} seconds`);
          if (age > 300) {
            console.log('⚠️  QR has EXPIRED (older than 5 minutes)');
          } else if (age < -60) {
            console.log('⚠️  QR has FUTURE timestamp');
          } else {
            console.log('✅ QR is within valid time window');
          }
        }
      } else {
        console.log('\n❌ Signature INVALID');
      }
    } catch (error) {
      console.error(`\n❌ Error parsing payload: ${error.message}`);
    }
    console.log('');
  });

program.parse();
