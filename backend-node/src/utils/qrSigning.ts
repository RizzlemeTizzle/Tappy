import crypto from 'crypto';

// QR Payload Interface
export interface QRPayload {
  v: number;           // Version
  evse_uid: string;    // OCPI EVSE identifier
  connector_id: string; // Connector number
  loc_id: string;      // Location/station ID
  cpo: string;         // Charge Point Operator code
  ts?: number;         // Timestamp (for replay protection)
  nonce?: string;      // Nonce (for replay protection)
  sig?: string;        // HMAC signature
}

// Configuration
const QR_VERSION = 1;
const QR_TTL_SECONDS = 300; // 5 minutes for replay protection
const DEFAULT_SECRET = process.env.QR_SIGNING_SECRET || 'tappycharge-qr-secret-key-2025';

// Provider-specific secrets (in production, load from DB)
const PROVIDER_SECRETS: Record<string, string> = {
  'CTP': process.env.QR_SECRET_CTP || DEFAULT_SECRET,
  'DEFAULT': DEFAULT_SECRET,
};

/**
 * Get signing secret for a provider/CPO
 */
export function getSigningSecret(cpo: string): string {
  return PROVIDER_SECRETS[cpo] || PROVIDER_SECRETS['DEFAULT'];
}

/**
 * Generate HMAC-SHA256 signature for QR payload
 */
export function generateSignature(payload: Omit<QRPayload, 'sig'>, secret: string): string {
  // Create deterministic string from payload (sorted keys)
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
  return hmac.digest('base64url').substring(0, 16); // Truncate for QR size
}

/**
 * Verify HMAC signature
 */
export function verifySignature(payload: QRPayload, secret: string): boolean {
  if (!payload.sig) return false;
  
  const { sig, ...payloadWithoutSig } = payload;
  const expectedSig = generateSignature(payloadWithoutSig, secret);
  
  // Timing-safe comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(sig),
      Buffer.from(expectedSig)
    );
  } catch {
    return false;
  }
}

/**
 * Generate a complete QR payload with signature
 */
export function generateQRPayload(
  evseUid: string,
  connectorId: string,
  locationId: string,
  cpo: string,
  options: { replayProtection?: boolean } = {}
): QRPayload {
  const payload: Omit<QRPayload, 'sig'> = {
    v: QR_VERSION,
    evse_uid: evseUid,
    connector_id: connectorId,
    loc_id: locationId,
    cpo: cpo,
  };
  
  // Add replay protection if enabled
  if (options.replayProtection) {
    payload.ts = Math.floor(Date.now() / 1000);
    payload.nonce = crypto.randomBytes(4).toString('hex');
  }
  
  const secret = getSigningSecret(cpo);
  const sig = generateSignature(payload, secret);
  
  return { ...payload, sig };
}

/**
 * Encode QR payload to URL string
 */
export function encodeQRPayload(payload: QRPayload): string {
  const params = new URLSearchParams();
  params.set('v', String(payload.v));
  params.set('evse_uid', payload.evse_uid);
  params.set('connector_id', payload.connector_id);
  params.set('loc_id', payload.loc_id);
  params.set('cpo', payload.cpo);
  if (payload.ts) params.set('ts', String(payload.ts));
  if (payload.nonce) params.set('nonce', payload.nonce);
  if (payload.sig) params.set('sig', payload.sig);
  
  return params.toString();
}

/**
 * Decode URL string to QR payload
 */
export function decodeQRPayload(payloadString: string): QRPayload | null {
  try {
    // Handle both full URLs and query strings
    let queryString = payloadString;
    if (payloadString.includes('?')) {
      queryString = payloadString.split('?')[1];
    }
    
    const params = new URLSearchParams(queryString);
    
    const v = params.get('v');
    const evse_uid = params.get('evse_uid');
    const connector_id = params.get('connector_id');
    const loc_id = params.get('loc_id');
    const cpo = params.get('cpo');
    const sig = params.get('sig');
    
    if (!v || !evse_uid || !connector_id || !loc_id || !cpo || !sig) {
      return null;
    }
    
    const payload: QRPayload = {
      v: parseInt(v, 10),
      evse_uid,
      connector_id,
      loc_id,
      cpo,
      sig,
    };
    
    const ts = params.get('ts');
    const nonce = params.get('nonce');
    if (ts) payload.ts = parseInt(ts, 10);
    if (nonce) payload.nonce = nonce;
    
    return payload;
  } catch {
    return null;
  }
}

/**
 * Validate QR payload (signature + optional replay protection)
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  payload?: QRPayload;
}

export function validateQRPayload(
  payload: QRPayload,
  options: { checkReplay?: boolean } = {}
): ValidationResult {
  // Version check
  if (payload.v !== QR_VERSION) {
    return { valid: false, error: 'INVALID_VERSION' };
  }
  
  // Signature verification
  const secret = getSigningSecret(payload.cpo);
  if (!verifySignature(payload, secret)) {
    return { valid: false, error: 'INVALID_SIGNATURE' };
  }
  
  // Replay protection check (if enabled and payload has timestamp)
  if (options.checkReplay && payload.ts) {
    const now = Math.floor(Date.now() / 1000);
    const age = now - payload.ts;
    
    if (age > QR_TTL_SECONDS) {
      return { valid: false, error: 'QR_EXPIRED' };
    }
    
    if (age < -60) { // Allow 60 seconds clock skew
      return { valid: false, error: 'QR_FUTURE_TIMESTAMP' };
    }
  }
  
  return { valid: true, payload };
}

/**
 * Generate deep link URL
 */
export function generateDeepLink(payload: QRPayload): string {
  const queryString = encodeQRPayload(payload);
  return `tappycharge://start?${queryString}`;
}

/**
 * Generate HTTPS fallback URL
 */
export function generateFallbackUrl(payload: QRPayload): string {
  const queryString = encodeQRPayload(payload);
  return `https://tappycharge.com/start?${queryString}`;
}
