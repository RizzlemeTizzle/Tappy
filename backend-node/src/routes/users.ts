import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const paymentMethodSchema = z.object({
  card_number: z.string(),
  expiry: z.string(),
  cvv: z.string(),
});

const userRoutes: FastifyPluginAsync = async (fastify) => {
  // Get current user
  fastify.get('/me', {
    preValidation: [fastify.authenticate as any],
  }, async (request, reply) => {
    const { userId } = request.user;
    
    const user = await fastify.prisma.user.findUnique({
      where: { id: userId },
    });
    
    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }
    
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      paymentMethodAdded: user.paymentMethodAdded,
      paymentMethodLast4: user.paymentMethodLast4,
    };
  });

  // Add payment method (mocked)
  fastify.post('/payment-method', {
    preValidation: [fastify.authenticate as any],
  }, async (request, reply) => {
    const { userId } = request.user;
    const body = paymentMethodSchema.parse(request.body);
    
    const last4 = body.card_number.slice(-4);
    
    await fastify.prisma.user.update({
      where: { id: userId },
      data: {
        paymentMethodAdded: true,
        paymentMethodLast4: last4,
      },
    });
    
    return { success: true, last4 };
  });
};

export default userRoutes;
