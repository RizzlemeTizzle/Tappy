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

function getPenaltySummary(pricingPlan: any): string {
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
    
    return stations.map(station => ({
      ...station,
      pricing: station.pricingPlan,
    }));
  });

  // Get nearby stations
  fastify.get('/nearby', async (request) => {
    const query = request.query as any;
    const lat = parseFloat(query.lat) || 51.9244;
    const lng = parseFloat(query.lng) || 4.4777;
    const radiusKm = parseFloat(query.radius_km) || 50;
    const connectorType = query.connector_type as string | undefined;
    const minPowerKw = query.min_power_kw ? parseFloat(query.min_power_kw) : undefined;
    const maxPriceCents = query.max_price_cents ? parseInt(query.max_price_cents) : undefined;
    const availableOnly = query.available_only === 'true';
    const sortBy = (query.sort_by as string) || 'distance';

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

      // Calculate estimated cost for 20 kWh
      const pricing = station.pricingPlan;
      const estimated20kwh = pricing.startFeeCents + 20 * pricing.energyRateCentsPerKwh;
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
          start_fee_cents: pricing.startFeeCents,
          energy_rate_cents_per_kwh: pricing.energyRateCentsPerKwh,
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
    
    return {
      ...station,
      pricing: station.pricingPlan,
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
  fastify.get('/chargers/status/bulk', async (request) => {
    const query = request.query as { ids: string };
    const chargerIds = query.ids.split(',').map(id => id.trim());
    
    const chargers = await fastify.prisma.charger.findMany({
      where: { id: { in: chargerIds } },
    });
    
    return chargers;
  });
};

export default stationRoutes;
