import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const COUNTRY_CODE = process.env.OCPI_COUNTRY_CODE || 'NL';
const PARTY_ID = process.env.OCPI_PARTY_ID || 'CTP';

// Rate limit tracking per CPO
const cpoRateLimits = new Map<string, { count: number; resetAt: number }>();

function checkCpoRateLimit(cpoId: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const key = cpoId;
  const record = cpoRateLimits.get(key);
  
  if (!record || now > record.resetAt) {
    cpoRateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  
  if (record.count >= limit) {
    return false;
  }
  
  record.count++;
  return true;
}

// OCPI response helper
function ocpiResponse(data: any, statusCode = 1000, statusMessage = 'Success') {
  return {
    data,
    status_code: statusCode,
    status_message: statusMessage,
    timestamp: new Date().toISOString(),
  };
}

function ocpiError(statusCode: number, message: string) {
  return {
    data: null,
    status_code: statusCode,
    status_message: message,
    timestamp: new Date().toISOString(),
  };
}

const ocpiTokenRoutes: FastifyPluginAsync = async (fastify) => {
  
  // ==================== OCPI eMSP Tokens Module ====================
  
  /**
   * GET /ocpi/emsp/2.2.1/tokens/{country_code}/{party_id}/{token_uid}
   * CPO retrieves token information
   */
  fastify.get('/emsp/2.2.1/tokens/:country_code/:party_id/:token_uid', async (request, reply) => {
    const { country_code, party_id, token_uid } = request.params as {
      country_code: string;
      party_id: string;
      token_uid: string;
    };
    
    // Get CPO credentials from Authorization header
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Token ')) {
      return reply.status(401).send(ocpiError(2001, 'Missing or invalid authorization'));
    }
    
    const cpoToken = authHeader.substring(6);
    const cpo = await fastify.prisma.ocpiCpoCredential.findFirst({
      where: { token: cpoToken, status: 'ACTIVE' },
      include: { tokenConfigs: true },
    });
    
    if (!cpo) {
      return reply.status(401).send(ocpiError(2001, 'Invalid CPO token'));
    }
    
    // Check rate limit
    const config = cpo.tokenConfigs[0];
    if (config && !checkCpoRateLimit(cpo.id, config.rateLimit, config.rateLimitWindow * 1000)) {
      return reply.status(429).send(ocpiError(3001, 'Rate limit exceeded'));
    }
    
    // Check if CPO is allowed to pull tokens
    if (config && !config.pullTokens) {
      return reply.status(403).send(ocpiError(2000, 'Token pull not allowed for this CPO'));
    }
    
    // Verify country_code and party_id match our eMSP
    if (country_code !== COUNTRY_CODE || party_id !== PARTY_ID) {
      return reply.status(404).send(ocpiError(2003, 'Unknown eMSP'));
    }
    
    // Find token
    const token = await fastify.prisma.rfidToken.findUnique({
      where: { uid: token_uid },
    });
    
    if (!token) {
      return reply.status(404).send(ocpiError(2004, 'Token not found'));
    }
    
    // Check if token type is allowed for this CPO
    if (config && !config.allowedTypes.includes(token.type)) {
      return reply.status(403).send(ocpiError(2000, 'Token type not allowed'));
    }
    
    // Build OCPI token response (no PII)
    const ocpiToken = {
      country_code: COUNTRY_CODE,
      party_id: PARTY_ID,
      uid: token.uid,
      type: token.type,
      contract_id: token.contractId,
      visual_number: token.visualNumber,
      issuer: token.issuer,
      group_id: token.groupId,
      valid: token.status === 'ACTIVE',
      whitelist: token.whitelist,
      language: token.language,
      default_profile_type: 'REGULAR',
      energy_contract: null,
      last_updated: token.lastUpdated.toISOString(),
    };
    
    return ocpiResponse(ocpiToken);
  });
  
  /**
   * PUT /ocpi/emsp/2.2.1/tokens/{country_code}/{party_id}/{token_uid}
   * CPO creates or updates a token (full replacement)
   */
  fastify.put('/emsp/2.2.1/tokens/:country_code/:party_id/:token_uid', async (request, reply) => {
    const { country_code, party_id, token_uid } = request.params as {
      country_code: string;
      party_id: string;
      token_uid: string;
    };
    
    // Verify authorization
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Token ')) {
      return reply.status(401).send(ocpiError(2001, 'Missing or invalid authorization'));
    }
    
    const cpoToken = authHeader.substring(6);
    const cpo = await fastify.prisma.ocpiCpoCredential.findFirst({
      where: { token: cpoToken, status: 'ACTIVE' },
    });
    
    if (!cpo) {
      return reply.status(401).send(ocpiError(2001, 'Invalid CPO token'));
    }
    
    if (country_code !== COUNTRY_CODE || party_id !== PARTY_ID) {
      return reply.status(404).send(ocpiError(2003, 'Unknown eMSP'));
    }
    
    // eMSP typically doesn't allow CPOs to modify tokens
    // This endpoint exists for OCPI compliance but returns error
    return reply.status(405).send(ocpiError(2000, 'Token modification by CPO not allowed'));
  });
  
  /**
   * PATCH /ocpi/emsp/2.2.1/tokens/{country_code}/{party_id}/{token_uid}
   * CPO partially updates a token
   */
  fastify.patch('/emsp/2.2.1/tokens/:country_code/:party_id/:token_uid', async (request, reply) => {
    const { country_code, party_id, token_uid } = request.params as {
      country_code: string;
      party_id: string;
      token_uid: string;
    };
    
    // Verify authorization
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Token ')) {
      return reply.status(401).send(ocpiError(2001, 'Missing or invalid authorization'));
    }
    
    const cpoToken = authHeader.substring(6);
    const cpo = await fastify.prisma.ocpiCpoCredential.findFirst({
      where: { token: cpoToken, status: 'ACTIVE' },
    });
    
    if (!cpo) {
      return reply.status(401).send(ocpiError(2001, 'Invalid CPO token'));
    }
    
    if (country_code !== COUNTRY_CODE || party_id !== PARTY_ID) {
      return reply.status(404).send(ocpiError(2003, 'Unknown eMSP'));
    }
    
    // eMSP typically doesn't allow CPOs to modify tokens
    return reply.status(405).send(ocpiError(2000, 'Token modification by CPO not allowed'));
  });
  
  /**
   * POST /ocpi/emsp/2.2.1/tokens/{token_uid}/authorize
   * Real-time authorization request from CPO
   */
  fastify.post('/emsp/2.2.1/tokens/:token_uid/authorize', async (request, reply) => {
    const { token_uid } = request.params as { token_uid: string };
    const startTime = Date.now();
    
    // Verify authorization
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Token ')) {
      return reply.status(401).send(ocpiError(2001, 'Missing or invalid authorization'));
    }
    
    const cpoToken = authHeader.substring(6);
    const cpo = await fastify.prisma.ocpiCpoCredential.findFirst({
      where: { token: cpoToken, status: 'ACTIVE' },
      include: { tokenConfigs: true },
    });
    
    if (!cpo) {
      return reply.status(401).send(ocpiError(2001, 'Invalid CPO token'));
    }
    
    // Check if real-time auth is enabled
    const config = cpo.tokenConfigs[0];
    if (config && !config.realTimeAuth) {
      return reply.status(405).send(ocpiError(2000, 'Real-time authorization not enabled'));
    }
    
    // Check rate limit
    if (config && !checkCpoRateLimit(cpo.id, config.rateLimit, config.rateLimitWindow * 1000)) {
      return reply.status(429).send(ocpiError(3001, 'Rate limit exceeded'));
    }
    
    // Parse request body (location info from CPO)
    const body = request.body as {
      location_id?: string;
      evse_uid?: string;
      connector_id?: string;
    } || {};
    
    // Find token
    const token = await fastify.prisma.rfidToken.findUnique({
      where: { uid: token_uid },
      include: { user: true },
    });
    
    let result = 'NOT_ALLOWED';
    let responseTime = 0;
    
    if (!token) {
      result = 'UNKNOWN';
    } else if (token.status === 'BLOCKED') {
      result = 'BLOCKED';
    } else if (token.status === 'EXPIRED' || (token.validUntil && token.validUntil < new Date())) {
      result = 'EXPIRED';
    } else if (token.status !== 'ACTIVE') {
      result = 'NOT_ALLOWED';
    } else if (!token.user?.paymentMethodAdded) {
      result = 'NO_CREDIT';
    } else {
      result = 'ALLOWED';
      
      // Update token usage
      await fastify.prisma.rfidToken.update({
        where: { id: token.id },
        data: {
          lastUsedAt: new Date(),
          usageCount: { increment: 1 },
        },
      });
    }
    
    responseTime = Date.now() - startTime;
    
    // Log authorization
    if (token) {
      await fastify.prisma.tokenAuthorization.create({
        data: {
          tokenId: token.id,
          cpoPartyId: cpo.partyId,
          cpoCountryCode: cpo.countryCode,
          locationId: body.location_id,
          evseUid: body.evse_uid,
          result,
          responseTime,
        },
      });
    }
    
    // Build OCPI authorization response
    const authorizationInfo = {
      allowed: result,
      token: token ? {
        country_code: COUNTRY_CODE,
        party_id: PARTY_ID,
        uid: token.uid,
        type: token.type,
        contract_id: token.contractId,
        issuer: token.issuer,
        valid: token.status === 'ACTIVE',
        whitelist: token.whitelist,
        last_updated: token.lastUpdated.toISOString(),
      } : undefined,
      location: body.location_id ? {
        id: body.location_id,
        name: 'Requested location',
      } : undefined,
      authorization_reference: token ? `AUTH-${Date.now()}-${token.uid.substring(0, 8)}` : undefined,
    };
    
    return ocpiResponse(authorizationInfo);
  });
};

export default ocpiTokenRoutes;
