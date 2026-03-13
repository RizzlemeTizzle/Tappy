import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';

const COUNTRY_CODE = process.env.OCPI_COUNTRY_CODE || 'NL';
const PARTY_ID = process.env.OCPI_PARTY_ID || 'CTP';

// Feature flag for token rotation
const TOKEN_ROTATION_ENABLED = process.env.NFC_TOKEN_ROTATION === 'true';
const TOKEN_ROTATION_DAYS = parseInt(process.env.NFC_TOKEN_ROTATION_DAYS || '30', 10);
const TOKEN_GRACE_PERIOD_HOURS = parseInt(process.env.NFC_TOKEN_GRACE_HOURS || '24', 10);

// Contract ID counter
let nfcContractIdCounter = 1;

function generateNfcUid(): string {
  // Generate 8-byte hex UID (similar to RFID format)
  // Format: CT + 6 random bytes = 8 bytes total
  const prefix = Buffer.from([0x43, 0x54]); // 'CT' in hex
  const random = crypto.randomBytes(6);
  return Buffer.concat([prefix, random]).toString('hex').toUpperCase();
}

function generateContractId(counter: number): string {
  const year = new Date().getFullYear();
  return `CTP-NFC-${year}-${String(counter).padStart(6, '0')}`;
}

function maskUid(uid: string): string {
  if (uid.length <= 4) return uid;
  return '**** ' + uid.slice(-4);
}

const nfcTokenRoutes: FastifyPluginAsync = async (fastify) => {
  
  // ==================== NFC TOKEN PROVISIONING ====================
  
  /**
   * Provision a new NFC HCE token for a device
   * POST /api/v1/tokens/nfc/provision
   */
  fastify.post('/v1/tokens/nfc/provision', {
    preValidation: [fastify.authenticate as any],
  }, async (request, reply) => {
    const { userId } = request.user;
    const body = request.body as {
      device_id: string;
      device_model?: string;
      android_version?: string;
      is_rooted?: boolean;
    };
    
    if (!body.device_id) {
      return reply.status(400).send({ error: 'device_id is required' });
    }
    
    // Block rooted devices
    if (body.is_rooted) {
      return reply.status(403).send({
        error: 'ROOTED_DEVICE',
        message: 'NFC HCE is not available on rooted devices for security reasons.',
      });
    }
    
    // Check if user has payment method
    const user = await fastify.prisma.user.findUnique({
      where: { id: userId },
    });
    
    if (!user?.paymentMethodAdded) {
      return reply.status(400).send({
        error: 'PAYMENT_REQUIRED',
        message: 'Please add a payment method before provisioning NFC token.',
      });
    }
    
    // Check if device already has a token
    const existingToken = await fastify.prisma.nfcToken.findFirst({
      where: { deviceId: body.device_id, status: { not: 'EXPIRED' } },
    });
    
    if (existingToken) {
      // Return existing token
      return {
        token_uid: existingToken.uid,
        contract_id: existingToken.contractId,
        visual_number: existingToken.visualNumber,
        status: existingToken.status,
        is_active: existingToken.isActive,
        hce_enabled: existingToken.hceEnabled,
        created_at: existingToken.createdAt,
        message: 'Existing token returned',
      };
    }
    
    // Get next contract ID
    const lastToken = await fastify.prisma.nfcToken.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { contractId: true },
    });
    if (lastToken) {
      const match = lastToken.contractId.match(/(\d+)$/);
      if (match) {
        nfcContractIdCounter = parseInt(match[1], 10) + 1;
      }
    }
    
    // Generate new token
    const uid = generateNfcUid();
    const contractId = generateContractId(nfcContractIdCounter);
    const visualNumber = maskUid(uid);
    
    const token = await fastify.prisma.nfcToken.create({
      data: {
        uid,
        contractId,
        visualNumber,
        type: 'HCE',
        status: 'ACTIVE',
        whitelist: 'ALWAYS',
        userId,
        deviceId: body.device_id,
        deviceModel: body.device_model,
        androidVersion: body.android_version,
        hceEnabled: false, // User needs to activate
        isActive: false,
        rotationEnabled: TOKEN_ROTATION_ENABLED,
      },
    });
    
    // Audit log
    await fastify.prisma.nfcTokenAuditLog.create({
      data: {
        tokenId: token.id,
        action: 'CREATED',
        deviceInfo: `${body.device_model || 'Unknown'} (Android ${body.android_version || '?'})`,
        ipAddress: request.ip,
      },
    });
    
    return {
      token_uid: token.uid,
      contract_id: token.contractId,
      visual_number: token.visualNumber,
      status: token.status,
      is_active: token.isActive,
      hce_enabled: token.hceEnabled,
      rotation_enabled: token.rotationEnabled,
      created_at: token.createdAt,
      message: 'NFC token provisioned successfully',
      next_steps: [
        'Enable HCE in app settings',
        'Test tap functionality',
        'Use at supported charging stations',
      ],
    };
  });
  
  /**
   * Get NFC token status for current user/device
   * GET /api/v1/tokens/nfc/status
   */
  fastify.get('/v1/tokens/nfc/status', {
    preValidation: [fastify.authenticate as any],
  }, async (request) => {
    const { userId } = request.user;
    const query = request.query as { device_id?: string };
    
    const where: any = { userId };
    if (query.device_id) {
      where.deviceId = query.device_id;
    }
    
    const tokens = await fastify.prisma.nfcToken.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    
    const activeToken = tokens.find(t => t.isActive && t.hceEnabled);
    
    return {
      tokens: tokens.map(t => ({
        id: t.id,
        token_uid: t.uid,
        contract_id: t.contractId,
        visual_number: t.visualNumber,
        status: t.status,
        is_active: t.isActive,
        hce_enabled: t.hceEnabled,
        device_id: t.deviceId,
        device_model: t.deviceModel,
        tap_count: t.tapCount,
        last_tap_at: t.lastTapAt,
        created_at: t.createdAt,
      })),
      active_token: activeToken ? {
        token_uid: activeToken.uid,
        contract_id: activeToken.contractId,
      } : null,
      total: tokens.length,
    };
  });
  
  /**
   * Set active NFC token
   * POST /api/v1/tokens/nfc/active
   */
  fastify.post('/v1/tokens/nfc/active', {
    preValidation: [fastify.authenticate as any],
  }, async (request, reply) => {
    const { userId } = request.user;
    const body = request.body as { token_id: string; device_id: string };
    
    if (!body.token_id || !body.device_id) {
      return reply.status(400).send({ error: 'token_id and device_id are required' });
    }
    
    // Find token
    const token = await fastify.prisma.nfcToken.findFirst({
      where: { id: body.token_id, userId, deviceId: body.device_id },
    });
    
    if (!token) {
      return reply.status(404).send({ error: 'Token not found' });
    }
    
    if (token.status !== 'ACTIVE') {
      return reply.status(400).send({ error: `Token is ${token.status}` });
    }
    
    // Deactivate all other tokens for this user/device
    await fastify.prisma.nfcToken.updateMany({
      where: { userId, deviceId: body.device_id, id: { not: token.id } },
      data: { isActive: false },
    });
    
    // Activate selected token and enable HCE
    const updated = await fastify.prisma.nfcToken.update({
      where: { id: token.id },
      data: { isActive: true, hceEnabled: true, lastUpdated: new Date() },
    });
    
    // Audit log
    await fastify.prisma.nfcTokenAuditLog.create({
      data: {
        tokenId: token.id,
        action: 'ACTIVATED',
        ipAddress: request.ip,
      },
    });
    
    return {
      token_uid: updated.uid,
      contract_id: updated.contractId,
      is_active: updated.isActive,
      hce_enabled: updated.hceEnabled,
      message: 'Token activated for HCE',
    };
  });
  
  /**
   * Disable HCE for a token
   * POST /api/v1/tokens/nfc/disable
   */
  fastify.post('/v1/tokens/nfc/disable', {
    preValidation: [fastify.authenticate as any],
  }, async (request, reply) => {
    const { userId } = request.user;
    const body = request.body as { token_id: string; device_id: string };
    
    const token = await fastify.prisma.nfcToken.findFirst({
      where: { id: body.token_id, userId, deviceId: body.device_id },
    });
    
    if (!token) {
      return reply.status(404).send({ error: 'Token not found' });
    }
    
    await fastify.prisma.nfcToken.update({
      where: { id: token.id },
      data: { isActive: false, hceEnabled: false, lastUpdated: new Date() },
    });
    
    await fastify.prisma.nfcTokenAuditLog.create({
      data: {
        tokenId: token.id,
        action: 'DEACTIVATED',
        ipAddress: request.ip,
      },
    });
    
    return { success: true, message: 'HCE disabled' };
  });
  
  /**
   * Rotate NFC token (generate new UID)
   * POST /api/v1/tokens/nfc/rotate
   */
  fastify.post('/v1/tokens/nfc/rotate', {
    preValidation: [fastify.authenticate as any],
  }, async (request, reply) => {
    const { userId } = request.user;
    const body = request.body as { token_id: string };
    
    if (!TOKEN_ROTATION_ENABLED) {
      return reply.status(400).send({
        error: 'TOKEN_ROTATION_DISABLED',
        message: 'Token rotation is not enabled',
      });
    }
    
    const token = await fastify.prisma.nfcToken.findFirst({
      where: { id: body.token_id, userId },
    });
    
    if (!token) {
      return reply.status(404).send({ error: 'Token not found' });
    }
    
    const oldUid = token.uid;
    const newUid = generateNfcUid();
    
    // Update token with new UID, keep old for grace period
    await fastify.prisma.nfcToken.update({
      where: { id: token.id },
      data: {
        uid: newUid,
        previousUid: oldUid,
        visualNumber: maskUid(newUid),
        rotatedAt: new Date(),
        expiresAt: new Date(Date.now() + TOKEN_GRACE_PERIOD_HOURS * 60 * 60 * 1000),
        lastUpdated: new Date(),
      },
    });
    
    await fastify.prisma.nfcTokenAuditLog.create({
      data: {
        tokenId: token.id,
        action: 'ROTATED',
        oldValue: oldUid,
        newValue: newUid,
        ipAddress: request.ip,
      },
    });
    
    return {
      new_token_uid: newUid,
      old_token_uid: oldUid,
      grace_period_hours: TOKEN_GRACE_PERIOD_HOURS,
      message: `Token rotated. Old UID valid for ${TOKEN_GRACE_PERIOD_HOURS} more hours.`,
    };
  });
  
  /**
   * Record a tap event (called from Android HCE service)
   * POST /api/v1/tokens/nfc/tap
   */
  fastify.post('/v1/tokens/nfc/tap', {
    preValidation: [fastify.authenticate as any],
  }, async (request) => {
    const { userId } = request.user;
    const body = request.body as {
      token_uid: string;
      device_id: string;
      location?: string;
    };
    
    const token = await fastify.prisma.nfcToken.findFirst({
      where: { uid: body.token_uid, userId, deviceId: body.device_id },
    });
    
    if (token) {
      await fastify.prisma.nfcToken.update({
        where: { id: token.id },
        data: {
          lastTapAt: new Date(),
          tapCount: { increment: 1 },
          lastLocation: body.location,
        },
      });
      
      await fastify.prisma.nfcTokenAuditLog.create({
        data: {
          tokenId: token.id,
          action: 'TAPPED',
          newValue: body.location,
          ipAddress: request.ip,
        },
      });
    }
    
    return { success: true, recorded: !!token };
  });
  
  /**
   * Get active token UID for HCE service
   * GET /api/v1/tokens/nfc/active-uid
   */
  fastify.get('/v1/tokens/nfc/active-uid', {
    preValidation: [fastify.authenticate as any],
  }, async (request) => {
    const { userId } = request.user;
    const query = request.query as { device_id: string };
    
    const token = await fastify.prisma.nfcToken.findFirst({
      where: {
        userId,
        deviceId: query.device_id,
        isActive: true,
        hceEnabled: true,
        status: 'ACTIVE',
      },
    });
    
    if (!token) {
      return { active: false, token_uid: null };
    }
    
    return {
      active: true,
      token_uid: token.uid,
      contract_id: token.contractId,
    };
  });
  
  // ==================== OCPI INTEGRATION ====================
  
  /**
   * Get NFC token for OCPI (CPO authorization)
   * This extends the existing OCPI tokens endpoint
   */
  fastify.get('/ocpi/emsp/2.2.1/tokens/hce/:token_uid', async (request, reply) => {
    const { token_uid } = request.params as { token_uid: string };
    
    // Verify CPO authorization
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Token ')) {
      return reply.status(401).send({
        data: null,
        status_code: 2001,
        status_message: 'Missing authorization',
        timestamp: new Date().toISOString(),
      });
    }
    
    const cpoToken = authHeader.substring(6);
    const cpo = await fastify.prisma.ocpiCpoCredential.findFirst({
      where: { token: cpoToken, status: 'ACTIVE' },
    });
    
    if (!cpo) {
      return reply.status(401).send({
        data: null,
        status_code: 2001,
        status_message: 'Invalid CPO token',
        timestamp: new Date().toISOString(),
      });
    }
    
    // Find NFC token (also check previousUid for grace period)
    let token = await fastify.prisma.nfcToken.findFirst({
      where: { uid: token_uid },
    });
    
    // Check previous UID if not found and within grace period
    if (!token) {
      token = await fastify.prisma.nfcToken.findFirst({
        where: {
          previousUid: token_uid,
          expiresAt: { gte: new Date() },
        },
      });
    }
    
    if (!token) {
      return reply.status(404).send({
        data: null,
        status_code: 2004,
        status_message: 'Token not found',
        timestamp: new Date().toISOString(),
      });
    }
    
    return {
      data: {
        country_code: COUNTRY_CODE,
        party_id: PARTY_ID,
        uid: token.uid,
        type: 'APP_USER', // HCE tokens appear as APP_USER in OCPI
        contract_id: token.contractId,
        visual_number: token.visualNumber,
        issuer: token.issuer,
        valid: token.status === 'ACTIVE',
        whitelist: token.whitelist,
        language: token.language,
        default_profile_type: 'REGULAR',
        last_updated: token.lastUpdated.toISOString(),
      },
      status_code: 1000,
      status_message: 'Success',
      timestamp: new Date().toISOString(),
    };
  });
  
  /**
   * Authorize NFC HCE token (real-time)
   * POST /api/ocpi/emsp/2.2.1/tokens/hce/:token_uid/authorize
   */
  fastify.post('/ocpi/emsp/2.2.1/tokens/hce/:token_uid/authorize', async (request, reply) => {
    const { token_uid } = request.params as { token_uid: string };
    const startTime = Date.now();
    
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Token ')) {
      return reply.status(401).send({
        data: null,
        status_code: 2001,
        status_message: 'Missing authorization',
        timestamp: new Date().toISOString(),
      });
    }
    
    const cpoToken = authHeader.substring(6);
    const cpo = await fastify.prisma.ocpiCpoCredential.findFirst({
      where: { token: cpoToken, status: 'ACTIVE' },
    });
    
    if (!cpo) {
      return reply.status(401).send({
        data: null,
        status_code: 2001,
        status_message: 'Invalid CPO token',
        timestamp: new Date().toISOString(),
      });
    }
    
    const body = request.body as {
      location_id?: string;
      evse_uid?: string;
    } || {};
    
    // Find token (including previous UID grace period)
    let token = await fastify.prisma.nfcToken.findFirst({
      where: { uid: token_uid },
      include: { user: true },
    });
    
    if (!token) {
      token = await fastify.prisma.nfcToken.findFirst({
        where: {
          previousUid: token_uid,
          expiresAt: { gte: new Date() },
        },
        include: { user: true },
      });
    }
    
    let result = 'NOT_ALLOWED';
    
    if (!token) {
      result = 'UNKNOWN';
    } else if (token.status === 'BLOCKED') {
      result = 'BLOCKED';
    } else if (token.status === 'EXPIRED') {
      result = 'EXPIRED';
    } else if (!token.hceEnabled) {
      result = 'NOT_ALLOWED';
    } else if (!token.user?.paymentMethodAdded) {
      result = 'NO_CREDIT';
    } else {
      result = 'ALLOWED';
      
      // Update usage
      await fastify.prisma.nfcToken.update({
        where: { id: token.id },
        data: {
          lastTapAt: new Date(),
          tapCount: { increment: 1 },
        },
      });
    }
    
    const responseTime = Date.now() - startTime;
    
    // Log authorization
    if (token) {
      await fastify.prisma.nfcTokenAuthorization.create({
        data: {
          tokenId: token.id,
          cpoPartyId: cpo.partyId,
          cpoCountryCode: cpo.countryCode,
          locationId: body.location_id,
          evseUid: body.evse_uid,
          result,
          responseTime,
          tapMethod: 'HCE',
        },
      });
    }
    
    return {
      data: {
        allowed: result,
        token: token ? {
          country_code: COUNTRY_CODE,
          party_id: PARTY_ID,
          uid: token.uid,
          type: 'APP_USER',
          contract_id: token.contractId,
          valid: token.status === 'ACTIVE',
          whitelist: token.whitelist,
          last_updated: token.lastUpdated.toISOString(),
        } : undefined,
        authorization_reference: token ? `HCE-${Date.now()}-${token.uid.substring(0, 8)}` : undefined,
      },
      status_code: 1000,
      status_message: 'Success',
      timestamp: new Date().toISOString(),
    };
  });
  
  // ==================== SIMULATOR/TESTING ====================
  
  /**
   * Simulate APDU exchange (for testing)
   * POST /api/v1/tokens/nfc/simulate-apdu
   */
  fastify.post('/v1/tokens/nfc/simulate-apdu', {
    preValidation: [fastify.authenticate as any],
  }, async (request, reply) => {
    const { userId } = request.user;
    const body = request.body as {
      token_uid: string;
      apdu_command: string; // Hex string
    };
    
    // Verify token belongs to user
    const token = await fastify.prisma.nfcToken.findFirst({
      where: { uid: body.token_uid, userId },
    });
    
    if (!token) {
      return reply.status(404).send({ error: 'Token not found' });
    }
    
    // Parse APDU command
    const command = body.apdu_command.replace(/\s/g, '').toUpperCase();
    
    // Simulate responses based on command
    let response = '';
    let description = '';
    
    if (command.startsWith('00A4')) {
      // SELECT command
      if (command.includes('F0436861726765546170')) {
        // Our AID: F0TappyCharge
        response = '9000'; // Success
        description = 'SELECT AID success';
      } else {
        response = '6A82'; // File not found
        description = 'Unknown AID';
      }
    } else if (command === '00B0000008') {
      // READ BINARY - return token UID
      response = token.uid + '9000';
      description = `Token UID: ${token.uid}`;
    } else if (command === '00CA0000') {
      // GET DATA
      response = token.uid + '9000';
      description = 'Token data returned';
    } else {
      response = '6D00'; // Instruction not supported
      description = 'Unknown command';
    }
    
    return {
      command: command,
      response: response,
      description: description,
      sw1sw2: response.slice(-4),
      data: response.slice(0, -4) || null,
    };
  });
};

export default nfcTokenRoutes;
