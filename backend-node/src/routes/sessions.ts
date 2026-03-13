import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';

const startSessionSchema = z.object({
  charger_id: z.string(),
});

const sessionRoutes: FastifyPluginAsync = async (fastify) => {
  // Start session
  fastify.post('/start', {
    preValidation: [fastify.authenticate],
  }, async (request, reply) => {
    const { userId } = request.user;
    const body = startSessionSchema.parse(request.body);
    
    // Get user
    const user = await fastify.prisma.user.findUnique({
      where: { id: userId },
    });
    
    if (!user?.paymentMethodAdded) {
      return reply.status(400).send({ error: 'Please add a payment method first' });
    }
    
    // Get charger
    const charger = await fastify.prisma.charger.findUnique({
      where: { id: body.charger_id },
      include: { station: true },
    });
    
    if (!charger) {
      return reply.status(404).send({ error: 'Charger not found' });
    }
    
    if (charger.status !== 'AVAILABLE') {
      return reply.status(400).send({ error: `Charger is ${charger.status}, not available` });
    }
    
    // Get pricing
    const pricing = await fastify.prisma.pricingPlan.findUnique({
      where: { stationId: charger.stationId },
    });
    
    if (!pricing) {
      return reply.status(404).send({ error: 'Pricing not found' });
    }
    
    // Create session with pricing snapshot
    const session = await fastify.prisma.session.create({
      data: {
        userId,
        chargerId: charger.id,
        stationId: charger.stationId,
        status: 'CHARGING',
        startedAt: new Date(),
        meterStartKwh: Math.random() * 4000 + 1000,
        pricingStartFeeCents: pricing.startFeeCents,
        pricingEnergyRateCents: pricing.energyRateCentsPerKwh,
        pricingTaxPercent: pricing.taxPercent,
        pricingPenaltyEnabled: pricing.penaltyEnabled,
        pricingPenaltyGraceMin: pricing.penaltyGraceMinutes,
        pricingPenaltyCentsPerMin: pricing.penaltyCentsPerMinute,
        pricingPenaltyCapCents: pricing.penaltyDailyCapCents,
      },
    });
    
    // Update charger status
    await fastify.prisma.charger.update({
      where: { id: charger.id },
      data: { status: 'CHARGING', currentSessionId: session.id },
    });
    
    // Start simulator
    fastify.chargerSimulator.startSimulation(session.id, charger.maxKw);
    
    return {
      session_id: session.id,
      pricing_snapshot: {
        start_fee_cents: pricing.startFeeCents,
        energy_rate_cents_per_kwh: pricing.energyRateCentsPerKwh,
        tax_percent: pricing.taxPercent,
        penalty: {
          enabled: pricing.penaltyEnabled,
          grace_minutes: pricing.penaltyGraceMinutes,
          penalty_cents_per_minute: pricing.penaltyCentsPerMinute,
          daily_cap_cents: pricing.penaltyDailyCapCents,
        },
      },
      charger: {
        id: charger.id,
        connector_type: charger.connectorType,
        max_kw: charger.maxKw,
      },
      message: 'Charging started successfully',
    };
  });

  // Get session by ID
  fastify.get('/:sessionId', {
    preValidation: [fastify.authenticate],
  }, async (request, reply) => {
    const { userId } = request.user;
    const { sessionId } = request.params as { sessionId: string };
    
    const session = await fastify.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        station: true,
        charger: true,
      },
    });
    
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }
    
    if (session.userId !== userId) {
      return reply.status(403).send({ error: 'Not your session' });
    }
    
    // Calculate penalty countdown
    let penaltyCountdown = null;
    if (session.status === 'COMPLETE' && session.chargingCompleteAt) {
      const penaltyStartTime = new Date(
        session.chargingCompleteAt.getTime() + session.pricingPenaltyGraceMin * 60 * 1000
      );
      const secondsUntilPenalty = (penaltyStartTime.getTime() - Date.now()) / 1000;
      if (secondsUntilPenalty > 0) {
        penaltyCountdown = Math.round(secondsUntilPenalty);
      }
    }
    
    return {
      id: session.id,
      user_id: session.userId,
      charger_id: session.chargerId,
      station_id: session.stationId,
      status: session.status,
      started_at: session.startedAt,
      ended_at: session.endedAt,
      charging_complete_at: session.chargingCompleteAt,
      delivered_kwh: session.deliveredKwh,
      current_power_kw: session.currentPowerKw,
      battery_percent: session.batteryPercent,
      meter_start_kwh: session.meterStartKwh,
      meter_end_kwh: session.meterEndKwh,
      energy_cost_cents: session.energyCostCents,
      penalty_minutes: session.penaltyMinutes,
      penalty_cost_cents: session.penaltyCostCents,
      tax_cents: session.taxCents,
      total_cost_cents: session.totalCostCents,
      pricing_snapshot: {
        start_fee_cents: session.pricingStartFeeCents,
        energy_rate_cents_per_kwh: session.pricingEnergyRateCents,
        tax_percent: session.pricingTaxPercent,
        penalty: {
          enabled: session.pricingPenaltyEnabled,
          grace_minutes: session.pricingPenaltyGraceMin,
          penalty_cents_per_minute: session.pricingPenaltyCentsPerMin,
          daily_cap_cents: session.pricingPenaltyCapCents,
        },
      },
      station: {
        id: session.station.id,
        name: session.station.name,
        address: session.station.address,
      },
      charger: {
        id: session.charger.id,
        connector_type: session.charger.connectorType,
        max_kw: session.charger.maxKw,
        status: session.charger.status,
      },
      penalty_countdown_seconds: penaltyCountdown,
    };
  });

  // Stop session
  fastify.post('/:sessionId/stop', {
    preValidation: [fastify.authenticate],
  }, async (request, reply) => {
    const { userId } = request.user;
    const { sessionId } = request.params as { sessionId: string };
    
    const session = await fastify.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        station: true,
        charger: true,
      },
    });
    
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }
    
    if (session.userId !== userId) {
      return reply.status(403).send({ error: 'Not your session' });
    }
    
    if (session.status === 'ENDED') {
      return reply.status(400).send({ error: 'Session already ended' });
    }
    
    // Stop simulator
    fastify.chargerSimulator.stopSimulation(sessionId);
    
    // Update session
    const updatedSession = await fastify.prisma.session.update({
      where: { id: sessionId },
      data: {
        status: 'ENDED',
        endedAt: new Date(),
      },
    });
    
    // Update charger
    await fastify.prisma.charger.update({
      where: { id: session.chargerId },
      data: { status: 'AVAILABLE', currentSessionId: null },
    });
    
    // Create mock payment
    const payment = await fastify.prisma.payment.create({
      data: {
        sessionId,
        userId,
        amountCents: updatedSession.totalCostCents,
        status: 'COMPLETED',
        stripePaymentIntentId: `pi_mock_${uuid().replace(/-/g, '').substring(0, 16)}`,
      },
    });
    
    return {
      id: updatedSession.id,
      status: updatedSession.status,
      ended_at: updatedSession.endedAt,
      delivered_kwh: updatedSession.deliveredKwh,
      energy_cost_cents: updatedSession.energyCostCents,
      penalty_minutes: updatedSession.penaltyMinutes,
      penalty_cost_cents: updatedSession.penaltyCostCents,
      tax_cents: updatedSession.taxCents,
      total_cost_cents: updatedSession.totalCostCents,
      station: {
        id: session.station.id,
        name: session.station.name,
        address: session.station.address,
      },
      charger: {
        id: session.charger.id,
        connector_type: session.charger.connectorType,
        max_kw: session.charger.maxKw,
      },
      payment: {
        id: payment.id,
        amount_cents: payment.amountCents,
        status: payment.status,
        stripe_payment_intent_id: payment.stripePaymentIntentId,
      },
    };
  });

  // Get user session history
  fastify.get('/user/history', {
    preValidation: [fastify.authenticate],
  }, async (request, reply) => {
    const { userId } = request.user;

    try {
      const sessions = await fastify.prisma.session.findMany({
        where: { userId },
        include: { station: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      return sessions.map((session) => ({
        id: session.id,
        status: session.status,
        started_at: session.startedAt,
        ended_at: session.endedAt,
        delivered_kwh: session.deliveredKwh,
        total_cost_cents: session.totalCostCents,
        station: {
          id: session.station.id,
          name: session.station.name,
          address: session.station.address,
        },
      }));
    } catch (err) {
      fastify.log.error({ err, userId }, 'Failed to fetch session history');
      return reply.status(500).send({ error: 'Failed to retrieve session history' });
    }
  });
};

export default sessionRoutes;
