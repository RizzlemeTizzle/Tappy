import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

// Admin credentials (hardcoded for MVP)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'chargetap2025';

// Contract ID counter (in production, use a sequence)
let contractIdCounter = 1;

function generateContractId(): string {
  const year = new Date().getFullYear();
  const num = String(contractIdCounter++).padStart(6, '0');
  return `CTP-NL-${year}-${num}`;
}

function maskCardNumber(uid: string): string {
  if (uid.length <= 4) return uid;
  return '**** ' + uid.slice(-4).toUpperCase();
}

// Basic auth check helper
function checkBasicAuth(authHeader: string | undefined): boolean {
  if (!authHeader?.startsWith('Basic ')) return false;
  try {
    const base64 = authHeader.substring(6);
    const decoded = Buffer.from(base64, 'base64').toString('utf-8');
    const [username, password] = decoded.split(':');
    return username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
  } catch {
    return false;
  }
}

const adminTokenRoutes: FastifyPluginAsync = async (fastify) => {
  
  // Auth check for all admin routes
  fastify.addHook('preHandler', async (request, reply) => {
    if (!checkBasicAuth(request.headers.authorization)) {
      reply.header('WWW-Authenticate', 'Basic realm="ChargeTap Admin"');
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  });
  
  // ==================== TOKEN MANAGEMENT ====================
  
  /**
   * List all tokens
   * GET /api/admin/tokens
   */
  fastify.get('/tokens', async (request) => {
    const query = request.query as {
      status?: string;
      search?: string;
      user_id?: string;
      limit?: string;
      offset?: string;
    };
    
    const where: any = {};
    
    if (query.status) {
      where.status = query.status;
    }
    
    if (query.user_id) {
      where.userId = query.user_id;
    }
    
    if (query.search) {
      where.OR = [
        { uid: { contains: query.search, mode: 'insensitive' } },
        { contractId: { contains: query.search, mode: 'insensitive' } },
        { user: { email: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    
    const limit = parseInt(query.limit || '50', 10);
    const offset = parseInt(query.offset || '0', 10);
    
    const [tokens, total] = await Promise.all([
      fastify.prisma.rfidToken.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, name: true } },
          _count: { select: { authorizations: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      fastify.prisma.rfidToken.count({ where }),
    ]);
    
    return {
      tokens: tokens.map(t => ({
        id: t.id,
        uid: t.uid,
        contract_id: t.contractId,
        visual_number: t.visualNumber,
        type: t.type,
        status: t.status,
        whitelist: t.whitelist,
        user: t.user,
        group_id: t.groupId,
        valid_from: t.validFrom,
        valid_until: t.validUntil,
        last_used_at: t.lastUsedAt,
        usage_count: t.usageCount,
        authorization_count: t._count.authorizations,
        created_at: t.createdAt,
        last_updated: t.lastUpdated,
      })),
      total,
      limit,
      offset,
    };
  });
  
  /**
   * Get single token
   * GET /api/admin/tokens/:id
   */
  fastify.get('/tokens/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    
    const token = await fastify.prisma.rfidToken.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, name: true } },
        auditLogs: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        authorizations: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });
    
    if (!token) {
      return reply.status(404).send({ error: 'Token not found' });
    }
    
    return {
      id: token.id,
      uid: token.uid,
      contract_id: token.contractId,
      visual_number: token.visualNumber,
      type: token.type,
      status: token.status,
      whitelist: token.whitelist,
      issuer: token.issuer,
      group_id: token.groupId,
      language: token.language,
      user: token.user,
      valid_from: token.validFrom,
      valid_until: token.validUntil,
      last_used_at: token.lastUsedAt,
      usage_count: token.usageCount,
      created_at: token.createdAt,
      last_updated: token.lastUpdated,
      audit_logs: token.auditLogs,
      recent_authorizations: token.authorizations,
    };
  });
  
  /**
   * Create new token
   * POST /api/admin/tokens
   */
  fastify.post('/tokens', async (request, reply) => {
    const body = request.body as {
      uid: string;
      type?: string;
      user_email?: string;
      group_id?: string;
      whitelist?: string;
      valid_until?: string;
    };
    
    if (!body.uid) {
      return reply.status(400).send({ error: 'RFID UID is required' });
    }
    
    // Normalize UID (remove spaces, uppercase)
    const uid = body.uid.replace(/[\s:]/g, '').toUpperCase();
    
    // Check for duplicate
    const existing = await fastify.prisma.rfidToken.findUnique({
      where: { uid },
    });
    
    if (existing) {
      return reply.status(409).send({ 
        error: 'Duplicate RFID UID',
        existing_token_id: existing.id,
        existing_contract_id: existing.contractId,
      });
    }
    
    // Find user if email provided
    let userId: string | null = null;
    if (body.user_email) {
      const user = await fastify.prisma.user.findUnique({
        where: { email: body.user_email },
      });
      if (!user) {
        return reply.status(404).send({ error: `User not found: ${body.user_email}` });
      }
      userId = user.id;
    }
    
    // Get next contract ID
    const lastToken = await fastify.prisma.rfidToken.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { contractId: true },
    });
    if (lastToken) {
      const match = lastToken.contractId.match(/(\d+)$/);
      if (match) {
        contractIdCounter = parseInt(match[1], 10) + 1;
      }
    }
    
    const contractId = generateContractId();
    const visualNumber = maskCardNumber(uid);
    
    const token = await fastify.prisma.rfidToken.create({
      data: {
        uid,
        contractId,
        visualNumber,
        type: body.type || 'RFID',
        status: 'ACTIVE',
        whitelist: body.whitelist || 'ALWAYS',
        userId,
        groupId: body.group_id,
        validUntil: body.valid_until ? new Date(body.valid_until) : null,
      },
    });
    
    // Create audit log
    await fastify.prisma.tokenAuditLog.create({
      data: {
        tokenId: token.id,
        action: 'CREATED',
        performedBy: ADMIN_USERNAME,
        ipAddress: request.ip,
      },
    });
    
    if (userId) {
      await fastify.prisma.tokenAuditLog.create({
        data: {
          tokenId: token.id,
          action: 'ASSIGNED',
          newValue: body.user_email,
          performedBy: ADMIN_USERNAME,
          ipAddress: request.ip,
        },
      });
    }
    
    return {
      id: token.id,
      uid: token.uid,
      contract_id: token.contractId,
      visual_number: token.visualNumber,
      status: token.status,
      whitelist: token.whitelist,
      user_id: token.userId,
      created_at: token.createdAt,
    };
  });
  
  /**
   * Update token
   * PATCH /api/admin/tokens/:id
   */
  fastify.patch('/tokens/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      status?: string;
      whitelist?: string;
      group_id?: string;
      valid_until?: string | null;
      reason?: string;
    };
    
    const token = await fastify.prisma.rfidToken.findUnique({
      where: { id },
    });
    
    if (!token) {
      return reply.status(404).send({ error: 'Token not found' });
    }
    
    const updates: any = { lastUpdated: new Date() };
    const auditLogs: any[] = [];
    
    if (body.status && body.status !== token.status) {
      const action = body.status === 'BLOCKED' ? 'BLOCKED' : 
                     body.status === 'ACTIVE' ? 'UNBLOCKED' :
                     body.status === 'EXPIRED' ? 'EXPIRED' : 'UPDATED';
      auditLogs.push({
        tokenId: id,
        action,
        field: 'status',
        oldValue: token.status,
        newValue: body.status,
        performedBy: ADMIN_USERNAME,
        ipAddress: request.ip,
        reason: body.reason,
      });
      updates.status = body.status;
    }
    
    if (body.whitelist && body.whitelist !== token.whitelist) {
      auditLogs.push({
        tokenId: id,
        action: 'UPDATED',
        field: 'whitelist',
        oldValue: token.whitelist,
        newValue: body.whitelist,
        performedBy: ADMIN_USERNAME,
        ipAddress: request.ip,
      });
      updates.whitelist = body.whitelist;
    }
    
    if (body.group_id !== undefined) {
      auditLogs.push({
        tokenId: id,
        action: 'UPDATED',
        field: 'group_id',
        oldValue: token.groupId,
        newValue: body.group_id,
        performedBy: ADMIN_USERNAME,
        ipAddress: request.ip,
      });
      updates.groupId = body.group_id;
    }
    
    if (body.valid_until !== undefined) {
      updates.validUntil = body.valid_until ? new Date(body.valid_until) : null;
    }
    
    const updated = await fastify.prisma.rfidToken.update({
      where: { id },
      data: updates,
    });
    
    // Create audit logs
    for (const log of auditLogs) {
      await fastify.prisma.tokenAuditLog.create({ data: log });
    }
    
    return {
      id: updated.id,
      uid: updated.uid,
      contract_id: updated.contractId,
      status: updated.status,
      whitelist: updated.whitelist,
      last_updated: updated.lastUpdated,
    };
  });
  
  /**
   * Assign token to user
   * POST /api/admin/tokens/:id/assign
   */
  fastify.post('/tokens/:id/assign', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { user_email: string };
    
    if (!body.user_email) {
      return reply.status(400).send({ error: 'user_email is required' });
    }
    
    const token = await fastify.prisma.rfidToken.findUnique({
      where: { id },
      include: { user: true },
    });
    
    if (!token) {
      return reply.status(404).send({ error: 'Token not found' });
    }
    
    const user = await fastify.prisma.user.findUnique({
      where: { email: body.user_email },
    });
    
    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }
    
    await fastify.prisma.rfidToken.update({
      where: { id },
      data: { userId: user.id, lastUpdated: new Date() },
    });
    
    await fastify.prisma.tokenAuditLog.create({
      data: {
        tokenId: id,
        action: 'ASSIGNED',
        oldValue: token.user?.email,
        newValue: user.email,
        performedBy: ADMIN_USERNAME,
        ipAddress: request.ip,
      },
    });
    
    return { success: true, user: { id: user.id, email: user.email, name: user.name } };
  });
  
  /**
   * Unassign token from user
   * POST /api/admin/tokens/:id/unassign
   */
  fastify.post('/tokens/:id/unassign', async (request, reply) => {
    const { id } = request.params as { id: string };
    
    const token = await fastify.prisma.rfidToken.findUnique({
      where: { id },
      include: { user: true },
    });
    
    if (!token) {
      return reply.status(404).send({ error: 'Token not found' });
    }
    
    if (!token.userId) {
      return reply.status(400).send({ error: 'Token is not assigned to a user' });
    }
    
    await fastify.prisma.rfidToken.update({
      where: { id },
      data: { userId: null, lastUpdated: new Date() },
    });
    
    await fastify.prisma.tokenAuditLog.create({
      data: {
        tokenId: id,
        action: 'UNASSIGNED',
        oldValue: token.user?.email,
        performedBy: ADMIN_USERNAME,
        ipAddress: request.ip,
      },
    });
    
    return { success: true };
  });
  
  // ==================== BULK OPERATIONS ====================
  
  /**
   * Import tokens from CSV
   * POST /api/admin/tokens/import
   * CSV format: rfid_uid,user_email,visual_number
   */
  fastify.post('/tokens/import', async (request, reply) => {
    const body = request.body as { csv: string; whitelist?: string; group_id?: string };
    
    if (!body.csv) {
      return reply.status(400).send({ error: 'CSV data is required' });
    }
    
    try {
      const records = parse(body.csv, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
      
      const results = {
        imported: 0,
        skipped: 0,
        errors: [] as { row: number; uid: string; error: string }[],
      };
      
      // Get starting contract ID
      const lastToken = await fastify.prisma.rfidToken.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { contractId: true },
      });
      if (lastToken) {
        const match = lastToken.contractId.match(/(\d+)$/);
        if (match) {
          contractIdCounter = parseInt(match[1], 10) + 1;
        }
      }
      
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const uid = (record.rfid_uid || record.uid || '').replace(/[\s:]/g, '').toUpperCase();
        
        if (!uid) {
          results.errors.push({ row: i + 2, uid: '', error: 'Missing RFID UID' });
          continue;
        }
        
        // Check duplicate
        const existing = await fastify.prisma.rfidToken.findUnique({ where: { uid } });
        if (existing) {
          results.skipped++;
          results.errors.push({ row: i + 2, uid, error: 'Duplicate UID' });
          continue;
        }
        
        // Find user if provided
        let userId: string | null = null;
        const userEmail = record.user_email || record.email;
        if (userEmail) {
          const user = await fastify.prisma.user.findUnique({ where: { email: userEmail } });
          if (user) {
            userId = user.id;
          } else {
            results.errors.push({ row: i + 2, uid, error: `User not found: ${userEmail}` });
          }
        }
        
        const contractId = generateContractId();
        const visualNumber = record.visual_number || maskCardNumber(uid);
        
        await fastify.prisma.rfidToken.create({
          data: {
            uid,
            contractId,
            visualNumber,
            type: 'RFID',
            status: 'ACTIVE',
            whitelist: body.whitelist || 'ALWAYS',
            userId,
            groupId: body.group_id,
          },
        });
        
        results.imported++;
      }
      
      return results;
    } catch (error: any) {
      return reply.status(400).send({ error: `CSV parse error: ${error.message}` });
    }
  });
  
  /**
   * Export tokens to CSV
   * GET /api/admin/tokens/export
   */
  fastify.get('/tokens/export', async (request, reply) => {
    const query = request.query as { status?: string; group_id?: string };
    
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.group_id) where.groupId = query.group_id;
    
    const tokens = await fastify.prisma.rfidToken.findMany({
      where,
      include: { user: { select: { email: true, name: true } } },
      orderBy: { contractId: 'asc' },
    });
    
    const records = tokens.map(t => ({
      contract_id: t.contractId,
      rfid_uid: t.uid,
      visual_number: t.visualNumber,
      type: t.type,
      status: t.status,
      whitelist: t.whitelist,
      user_email: t.user?.email || '',
      user_name: t.user?.name || '',
      group_id: t.groupId || '',
      valid_from: t.validFrom.toISOString(),
      valid_until: t.validUntil?.toISOString() || '',
      usage_count: t.usageCount,
      last_used_at: t.lastUsedAt?.toISOString() || '',
      created_at: t.createdAt.toISOString(),
    }));
    
    const csv = stringify(records, { header: true });
    
    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', `attachment; filename="tokens_export_${Date.now()}.csv"`);
    return csv;
  });
  
  // ==================== STATISTICS ====================
  
  /**
   * Get token statistics
   * GET /api/admin/tokens/stats
   */
  fastify.get('/tokens/stats', async () => {
    const [total, byStatus, byType, recentAuths] = await Promise.all([
      fastify.prisma.rfidToken.count(),
      fastify.prisma.rfidToken.groupBy({
        by: ['status'],
        _count: true,
      }),
      fastify.prisma.rfidToken.groupBy({
        by: ['type'],
        _count: true,
      }),
      fastify.prisma.tokenAuthorization.groupBy({
        by: ['result'],
        _count: true,
        where: {
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
    ]);
    
    return {
      total_tokens: total,
      by_status: Object.fromEntries(byStatus.map(s => [s.status, s._count])),
      by_type: Object.fromEntries(byType.map(t => [t.type, t._count])),
      authorizations_24h: Object.fromEntries(recentAuths.map(a => [a.result, a._count])),
    };
  });
};

export default adminTokenRoutes;
