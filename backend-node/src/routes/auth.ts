import { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Register — rate limited to prevent abuse
  fastify.post('/register', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const body = registerSchema.parse(request.body);
    
    // Check if email exists
    const existing = await fastify.prisma.user.findUnique({
      where: { email: body.email },
    });
    
    if (existing) {
      return reply.status(400).send({ error: 'Email already registered' });
    }
    
    const passwordHash = await bcrypt.hash(body.password, 10);
    const ocpiTokenUid = `CT-${uuid().substring(0, 8).toUpperCase()}`;
    
    const user = await fastify.prisma.user.create({
      data: {
        email: body.email,
        name: body.name,
        passwordHash,
        ocpiTokenUid,
        paymentMethodAdded: true,
        paymentMethodLast4: '4242',
        ocpiTokens: {
          create: {
            uid: ocpiTokenUid,
            type: 'APP_USER',
            authId: body.email,
            issuer: 'Tappy Charge',
          },
        },
      },
    });
    
    const token = fastify.jwt.sign(
      { userId: user.id, email: user.email },
      { expiresIn: '30d' }
    );
    
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        payment_method_added: user.paymentMethodAdded,
        payment_method_last4: user.paymentMethodLast4,
      },
    };
  });

  // Login — rate limited to slow brute-force attacks
  fastify.post('/login', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const body = loginSchema.parse(request.body);
    
    const user = await fastify.prisma.user.findUnique({
      where: { email: body.email },
    });
    
    if (!user) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }
    
    const validPassword = await bcrypt.compare(body.password, user.passwordHash);
    if (!validPassword) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }
    
    const token = fastify.jwt.sign(
      { userId: user.id, email: user.email },
      { expiresIn: '30d' }
    );
    
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        payment_method_added: user.paymentMethodAdded,
        payment_method_last4: user.paymentMethodLast4,
      },
    };
  });
};

export default authRoutes;
