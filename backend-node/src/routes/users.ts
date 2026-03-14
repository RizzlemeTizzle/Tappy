import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const paymentMethodSchema = z.object({
  card_number: z.string(),
  expiry: z.string(),
  cvv: z.string(),
});

const subscriptionSchema = z.object({
  plan: z.enum(['flex', 'comfort']),
});

const notificationPreferencesSchema = z.object({
  session_updates_enabled: z.boolean().optional(),
  penalty_alerts_enabled: z.boolean().optional(),
  payment_enabled: z.boolean().optional(),
  cost_milestones_enabled: z.boolean().optional(),
  cost_milestone_cents: z.number().int().refine((v) => [100, 200, 500, 1000].includes(v), {
    message: 'cost_milestone_cents must be 100, 200, 500, or 1000',
  }).optional(),
  penalty_prealert_minutes: z.number().int().refine((v) => [1, 3, 5, 10].includes(v), {
    message: 'penalty_prealert_minutes must be 1, 3, 5, or 10',
  }).optional(),
});

const userRoutes: FastifyPluginAsync = async (fastify) => {
  // Get current user
  fastify.get('/me', {
    preValidation: [fastify.authenticate],
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
      payment_method_added: user.paymentMethodAdded,
      payment_method_last4: user.paymentMethodLast4,
      subscription_plan: user.subscriptionPlan,
    };
  });

  // Get notification preferences
  fastify.get('/me/notification-preferences', {
    preValidation: [fastify.authenticate],
  }, async (request, reply) => {
    const { userId } = request.user;

    let prefs = await fastify.prisma.notificationPreference.findUnique({
      where: { userId },
    });

    if (!prefs) {
      prefs = await fastify.prisma.notificationPreference.create({
        data: { userId },
      });
    }

    return {
      session_updates_enabled: prefs.sessionUpdatesEnabled,
      penalty_alerts_enabled: prefs.penaltyAlertsEnabled,
      payment_enabled: prefs.paymentEnabled,
      cost_milestones_enabled: prefs.costMilestonesEnabled,
      cost_milestone_cents: prefs.costMilestoneIntervalCents,
      penalty_prealert_minutes: prefs.penaltyPrealertMinutes,
    };
  });

  // Update notification preferences
  fastify.put('/me/notification-preferences', {
    preValidation: [fastify.authenticate],
  }, async (request, reply) => {
    const { userId } = request.user;
    const body = notificationPreferencesSchema.parse(request.body);

    const data: Record<string, unknown> = {};
    if (body.session_updates_enabled !== undefined) data.sessionUpdatesEnabled = body.session_updates_enabled;
    if (body.penalty_alerts_enabled !== undefined) data.penaltyAlertsEnabled = body.penalty_alerts_enabled;
    if (body.payment_enabled !== undefined) data.paymentEnabled = body.payment_enabled;
    if (body.cost_milestones_enabled !== undefined) data.costMilestonesEnabled = body.cost_milestones_enabled;
    if (body.cost_milestone_cents !== undefined) data.costMilestoneIntervalCents = body.cost_milestone_cents;
    if (body.penalty_prealert_minutes !== undefined) data.penaltyPrealertMinutes = body.penalty_prealert_minutes;

    await fastify.prisma.notificationPreference.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });

    return { success: true };
  });

  // Store Expo push token
  fastify.post('/me/push-token', {
    preValidation: [fastify.authenticate],
  }, async (request, reply) => {
    const { userId } = request.user;
    const { token } = request.body as { token: string };

    if (!token || typeof token !== 'string') {
      return reply.status(400).send({ error: 'token is required' });
    }

    await fastify.prisma.user.update({
      where: { id: userId },
      data: { expoPushToken: token },
    });

    return { success: true };
  });

  // Update subscription plan
  fastify.put('/me/subscription', {
    preValidation: [fastify.authenticate],
  }, async (request, reply) => {
    const { userId } = request.user;
    const body = subscriptionSchema.parse(request.body);

    await fastify.prisma.user.update({
      where: { id: userId },
      data: { subscriptionPlan: body.plan },
    });

    return { success: true, plan: body.plan };
  });

  // Add payment method (mocked)
  fastify.post('/payment-method', {
    preValidation: [fastify.authenticate],
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
