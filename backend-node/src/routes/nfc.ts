import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const nfcResolveSchema = z.object({
  nfc_payload: z.string(),
});

const nfcRoutes: FastifyPluginAsync = async (fastify) => {
  // Resolve NFC payload to charger info
  fastify.post('/resolve', async (request, reply) => {
    const body = nfcResolveSchema.parse(request.body);
    const nfcPayload = body.nfc_payload;
    
    // Find charger by NFC payload or ID
    let charger = await fastify.prisma.charger.findFirst({
      where: { nfcPayload },
      include: { station: true },
    });
    
    if (!charger) {
      charger = await fastify.prisma.charger.findFirst({
        where: { id: nfcPayload },
        include: { station: true },
      });
    }
    
    if (!charger) {
      return reply.status(404).send({ error: 'Charger not found' });
    }
    
    const station = charger.station;
    const pricing = await fastify.prisma.pricingPlan.findUnique({
      where: { stationId: station.id },
    });
    
    if (!pricing) {
      return reply.status(404).send({ error: 'Pricing not found' });
    }
    
    return {
      charger: {
        id: charger.id,
        station_id: charger.stationId,
        connector_type: charger.connectorType,
        max_kw: charger.maxKw,
        status: charger.status,
        nfc_payload: charger.nfcPayload,
      },
      station: {
        id: station.id,
        name: station.name,
        address: station.address,
        latitude: station.latitude,
        longitude: station.longitude,
      },
      pricing: {
        id: pricing.id,
        station_id: pricing.stationId,
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
    };
  });
};

export default nfcRoutes;
