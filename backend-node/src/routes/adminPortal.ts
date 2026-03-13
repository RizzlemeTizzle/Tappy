import { FastifyPluginAsync } from 'fastify';
import {
  renderTokenList,
  renderTokenDetail,
  renderNewTokenForm,
  renderImportForm,
} from '../templates/adminPortal.js';

// Admin credentials
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'tappycharge2025';

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

const adminPortalRoutes: FastifyPluginAsync = async (fastify) => {
  
  // Auth check
  fastify.addHook('preHandler', async (request, reply) => {
    if (!checkBasicAuth(request.headers.authorization)) {
      reply.header('WWW-Authenticate', 'Basic realm="Tappy Charge Admin"');
      return reply.status(401).send('Unauthorized');
    }
  });
  
  /**
   * Token list page
   */
  fastify.get('/tokens', async (request, reply) => {
    const query = request.query as { status?: string; search?: string };
    
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { uid: { contains: query.search, mode: 'insensitive' } },
        { contractId: { contains: query.search, mode: 'insensitive' } },
        { user: { email: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    
    const [tokens, total, byStatus, byType, recentAuths] = await Promise.all([
      fastify.prisma.rfidToken.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      fastify.prisma.rfidToken.count(),
      fastify.prisma.rfidToken.groupBy({ by: ['status'], _count: true }),
      fastify.prisma.rfidToken.groupBy({ by: ['type'], _count: true }),
      fastify.prisma.tokenAuthorization.groupBy({
        by: ['result'],
        _count: true,
        where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      }),
    ]);
    
    const stats = {
      total_tokens: total,
      by_status: Object.fromEntries(byStatus.map(s => [s.status, s._count])),
      by_type: Object.fromEntries(byType.map(t => [t.type, t._count])),
      authorizations_24h: Object.fromEntries(recentAuths.map(a => [a.result, a._count])),
    };
    
    const tokenList = tokens.map(t => ({
      id: t.id,
      uid: t.uid,
      contract_id: t.contractId,
      visual_number: t.visualNumber,
      status: t.status,
      whitelist: t.whitelist,
      user: t.user,
      usage_count: t.usageCount,
    }));
    
    reply.type('text/html');
    return renderTokenList(tokenList, stats, query);
  });
  
  /**
   * Token detail page
   */
  fastify.get('/tokens/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    
    const token = await fastify.prisma.rfidToken.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, name: true } },
        auditLogs: { orderBy: { createdAt: 'desc' }, take: 50 },
        authorizations: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    
    if (!token) {
      return reply.status(404).send('Token not found');
    }
    
    reply.type('text/html');
    return renderTokenDetail(token);
  });
  
  /**
   * New token form
   */
  fastify.get('/tokens/new', async (request, reply) => {
    reply.type('text/html');
    return renderNewTokenForm();
  });
  
  /**
   * Create new token
   */
  fastify.post('/tokens/new', async (request, reply) => {
    const body = request.body as {
      uid: string;
      type?: string;
      whitelist?: string;
      user_email?: string;
      group_id?: string;
      valid_until?: string;
    };
    
    if (!body.uid) {
      reply.type('text/html');
      return renderNewTokenForm('RFID UID is verplicht');
    }
    
    const uid = body.uid.replace(/[\s:]/g, '').toUpperCase();
    
    // Check duplicate
    const existing = await fastify.prisma.rfidToken.findUnique({ where: { uid } });
    if (existing) {
      reply.type('text/html');
      return renderNewTokenForm(`RFID UID bestaat al (${existing.contractId})`);
    }
    
    // Find user
    let userId: string | null = null;
    if (body.user_email) {
      const user = await fastify.prisma.user.findUnique({ where: { email: body.user_email } });
      if (!user) {
        reply.type('text/html');
        return renderNewTokenForm(`Gebruiker niet gevonden: ${body.user_email}`);
      }
      userId = user.id;
    }
    
    // Generate contract ID
    const lastToken = await fastify.prisma.rfidToken.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { contractId: true },
    });
    let counter = 1;
    if (lastToken) {
      const match = lastToken.contractId.match(/(\d+)$/);
      if (match) counter = parseInt(match[1], 10) + 1;
    }
    const contractId = `CTP-NL-${new Date().getFullYear()}-${String(counter).padStart(6, '0')}`;
    const visualNumber = uid.length <= 4 ? uid : '**** ' + uid.slice(-4);
    
    const token = await fastify.prisma.rfidToken.create({
      data: {
        uid,
        contractId,
        visualNumber,
        type: body.type || 'RFID',
        status: 'ACTIVE',
        whitelist: body.whitelist || 'ALWAYS',
        userId,
        groupId: body.group_id || null,
        validUntil: body.valid_until ? new Date(body.valid_until) : null,
      },
    });
    
    // Audit log
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
    
    reply.type('text/html');
    return renderNewTokenForm(undefined, { contract_id: token.contractId });
  });
  
  /**
   * Import form
   */
  fastify.get('/tokens/import', async (request, reply) => {
    reply.type('text/html');
    return renderImportForm();
  });
  
  /**
   * Process import
   */
  fastify.post('/tokens/import', async (request, reply) => {
    const body = request.body as { csv: string; whitelist?: string; group_id?: string };
    
    if (!body.csv) {
      reply.type('text/html');
      return renderImportForm({ imported: 0, skipped: 0, errors: [{ row: 0, error: 'CSV data is verplicht' }] });
    }
    
    // Dynamic import for csv-parse
    const { parse } = await import('csv-parse/sync');
    
    try {
      const records = parse(body.csv, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
      
      const result = { imported: 0, skipped: 0, errors: [] as any[] };
      
      // Get starting counter
      const lastToken = await fastify.prisma.rfidToken.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { contractId: true },
      });
      let counter = 1;
      if (lastToken) {
        const match = lastToken.contractId.match(/(\d+)$/);
        if (match) counter = parseInt(match[1], 10) + 1;
      }
      
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const uid = (record.rfid_uid || record.uid || '').replace(/[\s:]/g, '').toUpperCase();
        
        if (!uid) {
          result.errors.push({ row: i + 2, error: 'Ontbrekende RFID UID' });
          continue;
        }
        
        const existing = await fastify.prisma.rfidToken.findUnique({ where: { uid } });
        if (existing) {
          result.skipped++;
          result.errors.push({ row: i + 2, error: `Duplicaat UID (${existing.contractId})` });
          continue;
        }
        
        let userId: string | null = null;
        const userEmail = record.user_email || record.email;
        if (userEmail) {
          const user = await fastify.prisma.user.findUnique({ where: { email: userEmail } });
          if (user) userId = user.id;
          else result.errors.push({ row: i + 2, error: `Gebruiker niet gevonden: ${userEmail}` });
        }
        
        const contractId = `CTP-NL-${new Date().getFullYear()}-${String(counter++).padStart(6, '0')}`;
        const visualNumber = record.visual_number || (uid.length <= 4 ? uid : '**** ' + uid.slice(-4));
        
        await fastify.prisma.rfidToken.create({
          data: {
            uid,
            contractId,
            visualNumber,
            type: 'RFID',
            status: 'ACTIVE',
            whitelist: body.whitelist || 'ALWAYS',
            userId,
            groupId: body.group_id || null,
          },
        });
        
        result.imported++;
      }
      
      reply.type('text/html');
      return renderImportForm(result);
    } catch (error: any) {
      reply.type('text/html');
      return renderImportForm({ imported: 0, skipped: 0, errors: [{ row: 0, error: `CSV parse error: ${error.message}` }] });
    }
  });
};

export default adminPortalRoutes;
