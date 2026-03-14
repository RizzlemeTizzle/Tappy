import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

interface PricingPlanSummary {
  penaltyEnabled: boolean;
  penaltyGraceMinutes: number;
  penaltyCentsPerMinute: number;
  penaltyDailyCapCents: number | null;
}

function getPenaltySummary(pricingPlan: PricingPlanSummary): string {
  if (!pricingPlan.penaltyEnabled) return 'No idle fee';
  const grace = pricingPlan.penaltyGraceMinutes;
  const rate = pricingPlan.penaltyCentsPerMinute;
  const cap = pricingPlan.penaltyDailyCapCents;
  const rateStr = `€${(rate / 100).toFixed(2)}/min`;
  const capStr = cap ? ` (max €${(cap / 100).toFixed(0)})` : ' (no cap)';
  return `Idle fee after ${grace}min: ${rateStr}${capStr}`;
}

const stationRoutes: FastifyPluginAsync = async (fastify) => {
  // Get all stations
  fastify.get('/', async () => {
    const stations = await fastify.prisma.station.findMany({
      include: {
        chargers: true,
        pricingPlan: true,
      },
    });

    return stations.map((station) => ({
      id: station.id,
      name: station.name,
      address: station.address,
      latitude: station.latitude,
      longitude: station.longitude,
      chargers: station.chargers.map((c) => ({
        id: c.id,
        station_id: c.stationId,
        connector_type: c.connectorType,
        max_kw: c.maxKw,
        status: c.status,
        nfc_payload: c.nfcPayload,
      })),
    }));
  });

  // Get nearby stations
  fastify.get('/nearby', async (request, reply) => {
    // Optional auth — apply subscription surcharges if user is logged in
    let subscriptionPlan = 'flex';
    const authHeader = (request.headers as Record<string, string | undefined>).authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const decoded = await request.jwtVerify() as { userId: string };
        const user = await fastify.prisma.user.findUnique({ where: { id: decoded.userId }, select: { subscriptionPlan: true } });
        subscriptionPlan = user?.subscriptionPlan ?? 'flex';
      } catch {
        // No valid token — treat as flex (unauthenticated)
      }
    }
    const isComfort = subscriptionPlan === 'comfort';
    const startFeeSurcharge = isComfort ? 0 : 31;
    const kwhSurcharge = isComfort ? 0 : 2;

    const query = request.query as {
      lat?: string;
      lng?: string;
      radius_km?: string;
      connector_type?: string;
      min_power_kw?: string;
      max_price_cents?: string;
      available_only?: string;
      sort_by?: string;
    };
    const lat = parseFloat(query.lat ?? '') || 51.9244;
    const lng = parseFloat(query.lng ?? '') || 4.4777;
    const radiusKm = parseFloat(query.radius_km ?? '') || 50;
    const connectorType = query.connector_type;
    const minPowerKw = query.min_power_kw ? parseFloat(query.min_power_kw) : undefined;
    const maxPriceCents = query.max_price_cents ? parseInt(query.max_price_cents, 10) : undefined;
    const availableOnly = query.available_only === 'true';
    const sortBy = query.sort_by ?? 'distance';

    const stations = await fastify.prisma.station.findMany({
      include: {
        chargers: true,
        pricingPlan: true,
      },
    });

    let results = [];

    for (const station of stations) {
      const distance = haversineDistance(lat, lng, station.latitude, station.longitude);
      if (distance > radiusKm) continue;
      if (!station.pricingPlan) continue;

      let chargers = station.chargers;

      // Filter by connector type
      if (connectorType) {
        chargers = chargers.filter(c => c.connectorType === connectorType);
        if (chargers.length === 0) continue;
      }

      // Filter by min power
      if (minPowerKw) {
        chargers = chargers.filter(c => c.maxKw >= minPowerKw);
        if (chargers.length === 0) continue;
      }

      // Filter by max price
      if (maxPriceCents && station.pricingPlan.energyRateCentsPerKwh > maxPriceCents) {
        continue;
      }

      // Calculate availability
      const availableChargers = chargers.filter(c => c.status === 'AVAILABLE');
      const availableCount = availableChargers.length;
      const totalCount = chargers.length;

      if (availableOnly && availableCount === 0) continue;

      // Get max power
      const maxPower = chargers.length > 0 ? Math.max(...chargers.map(c => c.maxKw)) : 0;

      // Calculate estimated cost for 20 kWh (with subscription surcharges)
      const pricing = station.pricingPlan;
      const effStart = pricing.startFeeCents + startFeeSurcharge;
      const effRate = pricing.energyRateCentsPerKwh + kwhSurcharge;
      const estimated20kwh = effStart + 20 * effRate;
      const estimated20kwhWithTax = Math.round(estimated20kwh * (1 + pricing.taxPercent / 100));

      // Build connector breakdown
      const connectorBreakdown: Record<string, { total: number; available: number; max_kw: number }> = {};
      for (const charger of chargers) {
        const ct = charger.connectorType;
        if (!connectorBreakdown[ct]) {
          connectorBreakdown[ct] = { total: 0, available: 0, max_kw: 0 };
        }
        connectorBreakdown[ct].total += 1;
        connectorBreakdown[ct].max_kw = Math.max(connectorBreakdown[ct].max_kw, charger.maxKw);
        if (charger.status === 'AVAILABLE') {
          connectorBreakdown[ct].available += 1;
        }
      }

      results.push({
        id: station.id,
        name: station.name,
        address: station.address,
        latitude: station.latitude,
        longitude: station.longitude,
        distance_km: Math.round(distance * 100) / 100,
        pricing_summary: {
          start_fee_cents: effStart,
          energy_rate_cents_per_kwh: effRate,
          tax_percent: pricing.taxPercent,
          penalty_summary: getPenaltySummary(pricing),
          penalty_enabled: pricing.penaltyEnabled,
          estimated_20kwh_cents: estimated20kwhWithTax,
        },
        availability: {
          available_count: availableCount,
          total_count: totalCount,
          connector_breakdown: connectorBreakdown,
        },
        max_power_kw: maxPower,
        updated_at: new Date().toISOString(),
      });
    }

    // Sort results
    switch (sortBy) {
      case 'distance':
        results.sort((a, b) => a.distance_km - b.distance_km);
        break;
      case 'price':
        results.sort((a, b) => a.pricing_summary.energy_rate_cents_per_kwh - b.pricing_summary.energy_rate_cents_per_kwh);
        break;
      case 'power':
        results.sort((a, b) => b.max_power_kw - a.max_power_kw);
        break;
      case 'estimated_cost':
        results.sort((a, b) => a.pricing_summary.estimated_20kwh_cents - b.pricing_summary.estimated_20kwh_cents);
        break;
    }

    return results;
  });

  // ==================== FAVORITES ====================

  // Get user's favorited stations
  fastify.get('/favorites', {
    preValidation: [fastify.authenticate],
  }, async (request) => {
    const { userId } = request.user;

    const favorites = await fastify.prisma.favoriteStation.findMany({
      where: { userId },
      include: {
        station: {
          include: { chargers: true, pricingPlan: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return favorites.map(({ station }) => ({
      id: station.id,
      name: station.name,
      address: station.address,
      latitude: station.latitude,
      longitude: station.longitude,
      chargers: station.chargers.map((c) => ({
        id: c.id,
        connector_type: c.connectorType,
        max_kw: c.maxKw,
        status: c.status,
      })),
      availability: {
        available_count: station.chargers.filter((c) => c.status === 'AVAILABLE').length,
        total_count: station.chargers.length,
      },
    }));
  });

  // Add station to favorites
  fastify.post('/:stationId/favorite', {
    preValidation: [fastify.authenticate],
  }, async (request, reply) => {
    const { userId } = request.user;
    const { stationId } = request.params as { stationId: string };

    const station = await fastify.prisma.station.findUnique({ where: { id: stationId } });
    if (!station) return reply.status(404).send({ error: 'Station not found' });

    const existing = await fastify.prisma.favoriteStation.findUnique({
      where: { userId_stationId: { userId, stationId } },
    });
    if (existing) return reply.status(409).send({ error: 'Already favorited' });

    await fastify.prisma.favoriteStation.create({ data: { userId, stationId } });
    return { success: true };
  });

  // Remove station from favorites
  fastify.delete('/:stationId/favorite', {
    preValidation: [fastify.authenticate],
  }, async (request, reply) => {
    const { userId } = request.user;
    const { stationId } = request.params as { stationId: string };

    const existing = await fastify.prisma.favoriteStation.findUnique({
      where: { userId_stationId: { userId, stationId } },
    });
    if (!existing) return reply.status(404).send({ error: 'Favorite not found' });

    await fastify.prisma.favoriteStation.delete({
      where: { userId_stationId: { userId, stationId } },
    });
    return { success: true };
  });

  // ==================== AVAILABILITY ALERTS ====================

  // Get all station IDs where user has a pending alert
  fastify.get('/alerts', {
    preValidation: [fastify.authenticate],
  }, async (request) => {
    const { userId } = request.user;

    const alerts = await fastify.prisma.availabilityAlertRequest.findMany({
      where: { userId },
      select: { stationId: true },
    });

    return { station_ids: alerts.map((a) => a.stationId) };
  });

  // Set a one-time availability alert for a station
  fastify.post('/:stationId/alert', {
    preValidation: [fastify.authenticate],
  }, async (request, reply) => {
    const { userId } = request.user;
    const { stationId } = request.params as { stationId: string };

    const station = await fastify.prisma.station.findUnique({ where: { id: stationId } });
    if (!station) return reply.status(404).send({ error: 'Station not found' });

    const existing = await fastify.prisma.availabilityAlertRequest.findUnique({
      where: { userId_stationId: { userId, stationId } },
    });
    if (existing) return reply.status(409).send({ error: 'Alert already set' });

    await fastify.prisma.availabilityAlertRequest.create({ data: { userId, stationId } });
    return { success: true };
  });

  // Cancel a pending availability alert
  fastify.delete('/:stationId/alert', {
    preValidation: [fastify.authenticate],
  }, async (request, reply) => {
    const { userId } = request.user;
    const { stationId } = request.params as { stationId: string };

    const existing = await fastify.prisma.availabilityAlertRequest.findUnique({
      where: { userId_stationId: { userId, stationId } },
    });
    if (!existing) return reply.status(404).send({ error: 'Alert not found' });

    await fastify.prisma.availabilityAlertRequest.delete({
      where: { userId_stationId: { userId, stationId } },
    });
    return { success: true };
  });

  // Get station by ID
  fastify.get('/:stationId', async (request, reply) => {
    const { stationId } = request.params as { stationId: string };

    const station = await fastify.prisma.station.findUnique({
      where: { id: stationId },
      include: {
        chargers: true,
        pricingPlan: true,
      },
    });

    if (!station) {
      return reply.status(404).send({ error: 'Station not found' });
    }

    const p = station.pricingPlan;

    return {
      id: station.id,
      name: station.name,
      address: station.address,
      latitude: station.latitude,
      longitude: station.longitude,
      chargers: station.chargers.map((c) => ({
        id: c.id,
        station_id: c.stationId,
        connector_type: c.connectorType,
        max_kw: c.maxKw,
        status: c.status,
        nfc_payload: c.nfcPayload,
      })),
      pricing: p ? {
        start_fee_cents: p.startFeeCents,
        energy_rate_cents_per_kwh: p.energyRateCentsPerKwh,
        tax_percent: p.taxPercent,
        penalty: {
          enabled: p.penaltyEnabled,
          grace_minutes: p.penaltyGraceMinutes,
          penalty_cents_per_minute: p.penaltyCentsPerMinute,
          daily_cap_cents: p.penaltyDailyCapCents,
        },
      } : null,
    };
  });

  // Get station pricing
  fastify.get('/:stationId/pricing', async (request, reply) => {
    const { stationId } = request.params as { stationId: string };
    
    const pricing = await fastify.prisma.pricingPlan.findUnique({
      where: { stationId },
    });
    
    if (!pricing) {
      return reply.status(404).send({ error: 'Pricing not found' });
    }
    
    return pricing;
  });

  // Get chargers status bulk
  fastify.get('/chargers/status/bulk', async (request, reply) => {
    const query = request.query as { ids?: string };
    if (!query.ids) {
      return reply.status(400).send({ error: 'ids query parameter is required' });
    }
    const chargerIds = query.ids
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 100); // Cap at 100 IDs to prevent oversized queries

    const chargers = await fastify.prisma.charger.findMany({
      where: { id: { in: chargerIds } },
    });

    return chargers;
  });
};

export default stationRoutes;
