import { FastifyPluginAsync } from 'fastify';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';

// OCPI Remote Start/Stop API for the mobile app
const startChargingSchema = z.object({
  charger_id: z.string(),
  connector_id: z.string().optional(),
});

const chargingRoutes: FastifyPluginAsync = async (fastify) => {
  // Start charging remotely via OCPI
  fastify.post('/start', {
    preValidation: [fastify.authenticate],
  }, async (request, reply) => {
    const { userId } = request.user;
    const body = startChargingSchema.parse(request.body);
    
    // Get user with OCPI token
    const user = await fastify.prisma.user.findUnique({
      where: { id: userId },
      include: { ocpiTokens: true },
    });
    
    if (!user?.paymentMethodAdded) {
      return reply.status(400).send({ error: 'Please add a payment method first' });
    }
    
    // Get charger with OCPI info
    const charger = await fastify.prisma.charger.findUnique({
      where: { id: body.charger_id },
      include: { station: true },
    });
    
    if (!charger) {
      return reply.status(404).send({ error: 'Charger not found' });
    }
    
    if (!charger.ocpiEvseUid) {
      return reply.status(400).send({ error: 'Charger not configured for remote start' });
    }
    
    // Get pricing
    const pricing = await fastify.prisma.pricingPlan.findUnique({
      where: { stationId: charger.stationId },
    });
    
    if (!pricing) {
      return reply.status(404).send({ error: 'Pricing not found' });
    }
    
    // Get OCPI token for user
    const ocpiToken = user.ocpiTokens[0];
    if (!ocpiToken) {
      return reply.status(400).send({ error: 'No OCPI token found for user' });
    }
    
    // Create OCPI command
    const commandId = uuid();
    await fastify.prisma.ocpiCommand.create({
      data: {
        id: commandId,
        type: 'START_SESSION',
        locationId: charger.stationId,
        evseUid: charger.ocpiEvseUid,
        connectorId: body.connector_id || charger.ocpiConnectorId,
        tokenUid: ocpiToken.uid,
        status: 'PENDING',
      },
    });
    
    // Create session (PENDING until CPO confirms)
    const session = await fastify.prisma.session.create({
      data: {
        userId,
        chargerId: charger.id,
        stationId: charger.stationId,
        status: 'PENDING',
        ocpiCommandId: commandId,
        meterStartKwh: 0,
        pricingStartFeeCents: pricing.startFeeCents,
        pricingEnergyRateCents: pricing.energyRateCentsPerKwh,
        pricingTaxPercent: pricing.taxPercent,
        pricingPenaltyEnabled: pricing.penaltyEnabled,
        pricingPenaltyGraceMin: pricing.penaltyGraceMinutes,
        pricingPenaltyCentsPerMin: pricing.penaltyCentsPerMinute,
        pricingPenaltyCapCents: pricing.penaltyDailyCapCents,
      },
    });
    
    // Update command with session ID
    await fastify.prisma.ocpiCommand.update({
      where: { id: commandId },
      data: { sessionId: session.id },
    });
    
    // Simulate CPO accepting the command (in production, this would be async via webhook)
    // For MVP, we simulate immediate acceptance after a short delay
    const sessionId = session.id;
    const chargerId = charger.id;
    const chargerMaxKw = charger.maxKw;
    setTimeout(() => {
      (async () => {
        try {
          await fastify.prisma.ocpiCommand.update({
            where: { id: commandId },
            data: { status: 'ACCEPTED', result: 'Session starting' },
          });

          const ocpiSessionId = `NL*CTP*S${Date.now()}`;
          await fastify.prisma.session.update({
            where: { id: sessionId },
            data: {
              status: 'CHARGING',
              startedAt: new Date(),
              ocpiSessionId,
              ocpiStatus: 'ACTIVE',
              meterStartKwh: Math.random() * 4000 + 1000,
            },
          });

          await fastify.prisma.charger.update({
            where: { id: chargerId },
            data: { status: 'CHARGING', currentSessionId: sessionId },
          });

          fastify.chargerSimulator.startSimulation(sessionId, chargerMaxKw);
        } catch (err) {
          fastify.log.error({ err, sessionId, commandId }, 'Error processing OCPI start command — marking session FAILED');
          // Mark session as failed so the user can retry rather than being stuck in PENDING
          await fastify.prisma.session.update({
            where: { id: sessionId },
            data: { status: 'FAILED' },
          }).catch((updateErr) => fastify.log.error({ updateErr }, 'Failed to mark session as FAILED'));
          await fastify.prisma.ocpiCommand.update({
            where: { id: commandId },
            data: { status: 'REJECTED', result: 'Internal error during session start' },
          }).catch((updateErr) => fastify.log.error({ updateErr }, 'Failed to update command status'));
        }
      })();
    }, 1500);
    
    return {
      session_id: session.id,
      command_id: commandId,
      status: 'PENDING',
      message: 'Remote start command sent. Session will begin shortly.',
      estimated_start_time: new Date(Date.now() + 2000).toISOString(),
      pricing_preview: {
        start_fee_cents: pricing.startFeeCents,
        energy_rate_cents_per_kwh: pricing.energyRateCentsPerKwh,
        tax_percent: pricing.taxPercent,
        estimated_20kwh_cents: Math.round(
          (pricing.startFeeCents + 20 * pricing.energyRateCentsPerKwh) * (1 + pricing.taxPercent / 100)
        ),
      },
      charger: {
        id: charger.id,
        connector_type: charger.connectorType,
        max_kw: charger.maxKw,
        evse_uid: charger.ocpiEvseUid,
      },
    };
  });

  // Stop charging remotely
  fastify.post('/stop', {
    preValidation: [fastify.authenticate],
  }, async (request, reply) => {
    const { userId } = request.user;
    const body = request.body as { session_id: string };
    
    const session = await fastify.prisma.session.findUnique({
      where: { id: body.session_id },
      include: { charger: true, station: true },
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
    
    // Create STOP command
    const commandId = uuid();
    await fastify.prisma.ocpiCommand.create({
      data: {
        id: commandId,
        type: 'STOP_SESSION',
        locationId: session.stationId,
        evseUid: session.charger.ocpiEvseUid,
        sessionId: session.id,
        status: 'PENDING',
      },
    });
    
    // Stop simulator immediately
    fastify.chargerSimulator.stopSimulation(session.id);
    
    // Update session and charger
    const updatedSession = await fastify.prisma.session.update({
      where: { id: session.id },
      data: {
        status: 'ENDED',
        endedAt: new Date(),
        ocpiStatus: 'COMPLETED',
      },
    });
    
    await fastify.prisma.charger.update({
      where: { id: session.chargerId },
      data: { status: 'AVAILABLE', currentSessionId: null },
    });
    
    // Update command
    await fastify.prisma.ocpiCommand.update({
      where: { id: commandId },
      data: { status: 'ACCEPTED', result: 'Session stopped' },
    });
    
    // Create payment
    const payment = await fastify.prisma.payment.create({
      data: {
        sessionId: session.id,
        userId,
        amountCents: updatedSession.totalCostCents,
        status: 'COMPLETED',
        stripePaymentIntentId: `pi_mock_${uuid().replace(/-/g, '').substring(0, 16)}`,
      },
    });
    
    // Create CDR (Charge Detail Record)
    if (updatedSession.startedAt && updatedSession.endedAt) {
      const parkingHours = (updatedSession.endedAt.getTime() - updatedSession.startedAt.getTime()) / 3600000;
      
      await fastify.prisma.ocpiCdr.create({
        data: {
          cdrId: `CDR-${Date.now()}-${uuid().substring(0, 8)}`,
          sessionId: session.id,
          startDateTime: updatedSession.startedAt,
          endDateTime: updatedSession.endedAt,
          totalKwh: updatedSession.deliveredKwh,
          totalParkingTime: parkingHours,
          totalCost: updatedSession.totalCostCents / 100,
          currency: 'EUR',
          authMethod: 'APP_USER',
          cpoId: 'NL-CTP',
          locationId: session.stationId,
          evseUid: session.charger.ocpiEvseUid || '',
          connectorId: session.charger.ocpiConnectorId || '1',
        },
      });
    }
    
    return {
      session_id: updatedSession.id,
      command_id: commandId,
      status: 'ENDED',
      final_cost: {
        energy_cost_cents: updatedSession.energyCostCents,
        start_fee_cents: updatedSession.pricingStartFeeCents,
        penalty_cost_cents: updatedSession.penaltyCostCents,
        tax_cents: updatedSession.taxCents,
        total_cents: updatedSession.totalCostCents,
      },
      session_summary: {
        started_at: updatedSession.startedAt,
        ended_at: updatedSession.endedAt,
        duration_minutes: updatedSession.startedAt && updatedSession.endedAt 
          ? Math.round((updatedSession.endedAt.getTime() - updatedSession.startedAt.getTime()) / 60000)
          : 0,
        delivered_kwh: updatedSession.deliveredKwh,
      },
      payment: {
        id: payment.id,
        status: payment.status,
        amount_cents: payment.amountCents,
      },
    };
  });

  // Get session status (with OCPI info)
  fastify.get('/status/:sessionId', {
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
    
    // Get command status if pending
    let commandStatus = null;
    if (session.ocpiCommandId) {
      const command = await fastify.prisma.ocpiCommand.findUnique({
        where: { id: session.ocpiCommandId },
      });
      if (command) {
        commandStatus = {
          id: command.id,
          type: command.type,
          status: command.status,
          result: command.result,
        };
      }
    }
    
    return {
      id: session.id,
      status: session.status,
      ocpi_status: session.ocpiStatus,
      ocpi_session_id: session.ocpiSessionId,
      command: commandStatus,
      live_data: {
        delivered_kwh: session.deliveredKwh,
        current_power_kw: session.currentPowerKw,
        battery_percent: session.batteryPercent,
        duration_seconds: session.startedAt 
          ? Math.floor((Date.now() - session.startedAt.getTime()) / 1000)
          : 0,
      },
      cost: {
        energy_cost_cents: session.energyCostCents,
        start_fee_cents: session.pricingStartFeeCents,
        penalty_cost_cents: session.penaltyCostCents,
        tax_cents: session.taxCents,
        total_cents: session.totalCostCents,
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
      },
    };
  });

  // Estimate cost before starting
  fastify.get('/estimate', {
    preValidation: [fastify.authenticate],
  }, async (request, reply) => {
    const query = request.query as { charger_id: string; target_kwh?: string; target_percent?: string };
    
    const charger = await fastify.prisma.charger.findUnique({
      where: { id: query.charger_id },
      include: { station: true },
    });
    
    if (!charger) {
      return reply.status(404).send({ error: 'Charger not found' });
    }
    
    const pricing = await fastify.prisma.pricingPlan.findUnique({
      where: { stationId: charger.stationId },
    });
    
    if (!pricing) {
      return reply.status(404).send({ error: 'Pricing not found' });
    }
    
    const targetKwh = query.target_kwh ? parseFloat(query.target_kwh) : 20;
    const currentPercent = query.target_percent ? parseFloat(query.target_percent) : 20;
    
    // Estimate based on 60 kWh battery
    const batteryCapacity = 60;
    const neededKwh = Math.min(targetKwh, batteryCapacity * ((100 - currentPercent) / 100));
    
    const energyCost = Math.round(neededKwh * pricing.energyRateCentsPerKwh);
    const subtotal = pricing.startFeeCents + energyCost;
    const tax = Math.round(subtotal * pricing.taxPercent / 100);
    const total = subtotal + tax;
    
    // Estimate charging time (assume 80% of max power average)
    const avgPower = charger.maxKw * 0.8;
    const chargingMinutes = Math.round((neededKwh / avgPower) * 60);
    
    return {
      charger: {
        id: charger.id,
        station_name: charger.station.name,
        connector_type: charger.connectorType,
        max_kw: charger.maxKw,
        status: charger.status,
      },
      estimate: {
        target_kwh: neededKwh,
        estimated_minutes: chargingMinutes,
        breakdown: {
          start_fee_cents: pricing.startFeeCents,
          energy_cost_cents: energyCost,
          tax_cents: tax,
        },
        total_cents: total,
        total_display: `€${(total / 100).toFixed(2)}`,
        price_per_kwh_display: `€${(pricing.energyRateCentsPerKwh / 100).toFixed(2)}/kWh`,
      },
      penalties: pricing.penaltyEnabled ? {
        grace_minutes: pricing.penaltyGraceMinutes,
        rate_per_minute_cents: pricing.penaltyCentsPerMinute,
        daily_cap_cents: pricing.penaltyDailyCapCents,
        warning: `Idle fee of €${(pricing.penaltyCentsPerMinute / 100).toFixed(2)}/min after ${pricing.penaltyGraceMinutes}min grace period`,
      } : null,
    };
  });
};

export default chargingRoutes;
