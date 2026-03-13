import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  decodeQRPayload,
  validateQRPayload,
  generateQRPayload,
  encodeQRPayload,
  generateDeepLink,
  generateFallbackUrl,
  QRPayload,
} from '../utils/qrSigning.js';

// Telemetry events storage (in production, use proper analytics)
const telemetryEvents: Array<{
  event: string;
  timestamp: Date;
  data: Record<string, any>;
}> = [];

// Feature flag for replay protection
const REPLAY_PROTECTION_ENABLED = process.env.QR_REPLAY_PROTECTION === 'true';

// Rate limit tracking (simple in-memory, use Redis in production)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 30; // 30 requests per minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  
  if (!record || now > record.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }
  
  record.count++;
  return true;
}

const qrRoutes: FastifyPluginAsync = async (fastify) => {
  
  // ==================== PUBLIC ENDPOINTS ====================
  
  /**
   * Resolve QR payload - validates signature and returns connector data
   * GET /api/v1/qr/resolve?payload=...
   */
  fastify.get('/v1/qr/resolve', async (request, reply) => {
    const clientIp = request.ip || 'unknown';
    
    // Rate limiting
    if (!checkRateLimit(clientIp)) {
      return reply.status(429).send({
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
      });
    }
    
    const { payload: payloadString } = request.query as { payload?: string };
    
    if (!payloadString) {
      return reply.status(400).send({
        error: 'MISSING_PAYLOAD',
        message: 'QR payload is required',
      });
    }
    
    // Decode payload
    const payload = decodeQRPayload(decodeURIComponent(payloadString));
    if (!payload) {
      // Log telemetry
      telemetryEvents.push({
        event: 'qr_scanned',
        timestamp: new Date(),
        data: { success: false, error: 'INVALID_FORMAT', ip: clientIp },
      });
      
      return reply.status(400).send({
        error: 'INVALID_QR_FORMAT',
        message: 'Could not parse QR code. Please scan a valid Tappy Charge QR.',
      });
    }
    
    // Validate signature and replay protection
    const validation = validateQRPayload(payload, {
      checkReplay: REPLAY_PROTECTION_ENABLED,
    });
    
    if (!validation.valid) {
      telemetryEvents.push({
        event: 'qr_scanned',
        timestamp: new Date(),
        data: { success: false, error: validation.error, evse_uid: payload.evse_uid, ip: clientIp },
      });
      
      const errorMessages: Record<string, string> = {
        'INVALID_VERSION': 'QR code version not supported. Please update your app.',
        'INVALID_SIGNATURE': 'Invalid QR code. This may be a counterfeit.',
        'QR_EXPIRED': 'QR code has expired. Please scan again.',
        'QR_FUTURE_TIMESTAMP': 'Invalid QR code timestamp.',
      };
      
      return reply.status(400).send({
        error: validation.error,
        message: errorMessages[validation.error!] || 'Invalid QR code.',
      });
    }
    
    // Find charger by EVSE UID
    const charger = await fastify.prisma.charger.findFirst({
      where: { ocpiEvseUid: payload.evse_uid },
      include: { station: true },
    });
    
    if (!charger) {
      telemetryEvents.push({
        event: 'qr_scanned',
        timestamp: new Date(),
        data: { success: false, error: 'UNKNOWN_CONNECTOR', evse_uid: payload.evse_uid, ip: clientIp },
      });
      
      return reply.status(404).send({
        error: 'UNKNOWN_CONNECTOR',
        message: 'Charging point not found. It may have been removed.',
      });
    }
    
    // Get pricing
    const pricing = await fastify.prisma.pricingPlan.findUnique({
      where: { stationId: charger.stationId },
    });
    
    if (!pricing) {
      return reply.status(404).send({
        error: 'PRICING_NOT_FOUND',
        message: 'Pricing information not available.',
      });
    }
    
    // Calculate tariff estimate (20 kWh)
    const targetKwh = 20;
    const energyCost = Math.round(targetKwh * pricing.energyRateCentsPerKwh);
    const subtotal = pricing.startFeeCents + energyCost;
    const tax = Math.round(subtotal * pricing.taxPercent / 100);
    const total = subtotal + tax;
    
    // Estimate charging time (assume 80% of max power average)
    const avgPower = charger.maxKw * 0.8;
    const chargingMinutes = Math.round((targetKwh / avgPower) * 60);
    
    // Log successful scan
    telemetryEvents.push({
      event: 'qr_scanned',
      timestamp: new Date(),
      data: {
        success: true,
        evse_uid: payload.evse_uid,
        station_id: charger.stationId,
        connector_type: charger.connectorType,
        ip: clientIp,
      },
    });
    
    return {
      qr_valid: true,
      charger: {
        id: charger.id,
        evse_uid: charger.ocpiEvseUid,
        connector_id: charger.ocpiConnectorId || payload.connector_id,
        connector_type: charger.connectorType,
        max_kw: charger.maxKw,
        status: charger.status,
      },
      station: {
        id: charger.station.id,
        name: charger.station.name,
        address: charger.station.address,
        latitude: charger.station.latitude,
        longitude: charger.station.longitude,
      },
      tariff: {
        start_fee_cents: pricing.startFeeCents,
        energy_rate_cents_per_kwh: pricing.energyRateCentsPerKwh,
        tax_percent: pricing.taxPercent,
        penalty_enabled: pricing.penaltyEnabled,
        penalty_grace_minutes: pricing.penaltyGraceMinutes,
        penalty_cents_per_minute: pricing.penaltyCentsPerMinute,
      },
      estimate: {
        target_kwh: targetKwh,
        estimated_minutes: chargingMinutes,
        energy_cost_cents: energyCost,
        start_fee_cents: pricing.startFeeCents,
        tax_cents: tax,
        total_cents: total,
        total_display: `€${(total / 100).toFixed(2)}`,
      },
      cpo: payload.cpo,
    };
  });
  
  /**
   * Telemetry endpoint for QR events
   * POST /api/v1/qr/telemetry
   */
  fastify.post('/v1/qr/telemetry', async (request, reply) => {
    const body = request.body as {
      event: string;
      evse_uid?: string;
      session_id?: string;
      error?: string;
      metadata?: Record<string, any>;
    };
    
    const validEvents = ['qr_scanned', 'qr_start_initiated', 'qr_start_success', 'qr_start_failed'];
    if (!validEvents.includes(body.event)) {
      return reply.status(400).send({ error: 'Invalid event type' });
    }
    
    telemetryEvents.push({
      event: body.event,
      timestamp: new Date(),
      data: {
        evse_uid: body.evse_uid,
        session_id: body.session_id,
        error: body.error,
        ...body.metadata,
      },
    });
    
    return { success: true };
  });
  
  // ==================== ADMIN ENDPOINTS ====================
  
  /**
   * Generate QR payload for stickers
   * POST /api/admin/qr/generate
   */
  fastify.post('/admin/qr/generate', async (request, reply) => {
    // In production, add admin authentication here
    const body = request.body as {
      evse_uid: string;
      connector_id: string;
      replay_protection?: boolean;
    };
    
    if (!body.evse_uid || !body.connector_id) {
      return reply.status(400).send({
        error: 'Missing required fields: evse_uid, connector_id',
      });
    }
    
    // Find charger to get location info
    const charger = await fastify.prisma.charger.findFirst({
      where: { ocpiEvseUid: body.evse_uid },
      include: { station: true },
    });
    
    if (!charger) {
      return reply.status(404).send({
        error: 'Charger not found with given EVSE UID',
      });
    }
    
    // Generate payload
    const cpo = process.env.OCPI_PARTY_ID || 'CTP';
    const payload = generateQRPayload(
      body.evse_uid,
      body.connector_id,
      charger.stationId,
      cpo,
      { replayProtection: body.replay_protection ?? false }
    );
    
    const queryString = encodeQRPayload(payload);
    const deepLink = generateDeepLink(payload);
    const fallbackUrl = generateFallbackUrl(payload);
    
    return {
      payload,
      encoded: queryString,
      urls: {
        deep_link: deepLink,
        fallback_url: fallbackUrl,
      },
      charger: {
        id: charger.id,
        station_name: charger.station.name,
        connector_type: charger.connectorType,
        max_kw: charger.maxKw,
      },
      instructions: {
        qr_content: deepLink,
        note: 'Use the deep_link URL as QR code content. Scanning will open the app directly.',
      },
    };
  });
  
  /**
   * Bulk generate QR codes for all chargers at a station
   * POST /api/admin/qr/generate-station
   */
  fastify.post('/admin/qr/generate-station', async (request, reply) => {
    const body = request.body as {
      station_id: string;
      replay_protection?: boolean;
    };
    
    if (!body.station_id) {
      return reply.status(400).send({ error: 'station_id is required' });
    }
    
    const chargers = await fastify.prisma.charger.findMany({
      where: { stationId: body.station_id },
      include: { station: true },
    });
    
    if (chargers.length === 0) {
      return reply.status(404).send({ error: 'No chargers found at station' });
    }
    
    const cpo = process.env.OCPI_PARTY_ID || 'CTP';
    const results = chargers.map(charger => {
      if (!charger.ocpiEvseUid) return null;
      
      const payload = generateQRPayload(
        charger.ocpiEvseUid,
        charger.ocpiConnectorId || '1',
        charger.stationId,
        cpo,
        { replayProtection: body.replay_protection ?? false }
      );
      
      return {
        charger_id: charger.id,
        evse_uid: charger.ocpiEvseUid,
        connector_type: charger.connectorType,
        max_kw: charger.maxKw,
        qr_content: generateDeepLink(payload),
        fallback_url: generateFallbackUrl(payload),
      };
    }).filter(Boolean);
    
    return {
      station: {
        id: chargers[0].station.id,
        name: chargers[0].station.name,
        address: chargers[0].station.address,
      },
      chargers: results,
      total: results.length,
    };
  });
  
  /**
   * Get telemetry stats
   * GET /api/admin/qr/telemetry
   */
  fastify.get('/admin/qr/telemetry', async (request, reply) => {
    const query = request.query as { limit?: string };
    const limit = parseInt(query.limit || '100', 10);
    
    const recentEvents = telemetryEvents.slice(-limit);
    
    // Calculate stats
    const stats = {
      total_scans: telemetryEvents.filter(e => e.event === 'qr_scanned').length,
      successful_scans: telemetryEvents.filter(e => e.event === 'qr_scanned' && e.data.success).length,
      start_initiated: telemetryEvents.filter(e => e.event === 'qr_start_initiated').length,
      start_success: telemetryEvents.filter(e => e.event === 'qr_start_success').length,
      start_failed: telemetryEvents.filter(e => e.event === 'qr_start_failed').length,
    };
    
    return {
      stats,
      recent_events: recentEvents.reverse(),
    };
  });
};

export default qrRoutes;
