import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

// OCPI 2.2.1 Endpoints for CPO integration
const ocpiRoutes: FastifyPluginAsync = async (fastify) => {
  // OCPI Versions endpoint
  fastify.get('/versions', async () => {
    return {
      versions: [
        {
          version: '2.2.1',
          url: `${process.env.OCPI_BASE_URL || 'http://localhost:8001'}/api/ocpi/2.2.1`,
        },
      ],
    };
  });

  // OCPI 2.2.1 version details
  fastify.get('/2.2.1', async () => {
    const baseUrl = process.env.OCPI_BASE_URL || 'http://localhost:8001';
    return {
      version: '2.2.1',
      endpoints: [
        { identifier: 'credentials', role: 'RECEIVER', url: `${baseUrl}/api/ocpi/2.2.1/credentials` },
        { identifier: 'locations', role: 'SENDER', url: `${baseUrl}/api/ocpi/2.2.1/locations` },
        { identifier: 'sessions', role: 'SENDER', url: `${baseUrl}/api/ocpi/2.2.1/sessions` },
        { identifier: 'cdrs', role: 'SENDER', url: `${baseUrl}/api/ocpi/2.2.1/cdrs` },
        { identifier: 'tariffs', role: 'SENDER', url: `${baseUrl}/api/ocpi/2.2.1/tariffs` },
        { identifier: 'tokens', role: 'RECEIVER', url: `${baseUrl}/api/ocpi/2.2.1/tokens` },
        { identifier: 'commands', role: 'RECEIVER', url: `${baseUrl}/api/ocpi/2.2.1/commands` },
      ],
    };
  });

  // Locations (list stations for CPOs)
  fastify.get('/2.2.1/locations', async (request) => {
    const query = request.query as { date_from?: string; date_to?: string; offset?: string; limit?: string };
    const limit = parseInt(query.limit || '100');
    const offset = parseInt(query.offset || '0');
    
    const stations = await fastify.prisma.station.findMany({
      include: {
        chargers: true,
        pricingPlan: true,
      },
      skip: offset,
      take: limit,
    });
    
    const locations = stations.map(station => ({
      country_code: 'NL',
      party_id: process.env.OCPI_PARTY_ID || 'CTP',
      id: station.id,
      publish: true,
      name: station.name,
      address: station.address,
      city: 'Rotterdam',
      country: 'NLD',
      coordinates: {
        latitude: String(station.latitude),
        longitude: String(station.longitude),
      },
      time_zone: 'Europe/Amsterdam',
      evses: station.chargers.map(charger => ({
        uid: charger.ocpiEvseUid || charger.id,
        evse_id: charger.ocpiEvseUid || `NL*CTP*E${charger.id}`,
        status: charger.status === 'AVAILABLE' ? 'AVAILABLE' : 
                charger.status === 'CHARGING' ? 'CHARGING' : 
                charger.status === 'FAULTED' ? 'OUTOFORDER' : 'UNKNOWN',
        connectors: [{
          id: charger.ocpiConnectorId || '1',
          standard: charger.connectorType === 'CCS' ? 'IEC_62196_T2_COMBO' :
                   charger.connectorType === 'CHAdeMO' ? 'CHADEMO' : 'IEC_62196_T2',
          format: 'CABLE',
          power_type: charger.maxKw > 22 ? 'DC' : 'AC_3_PHASE',
          max_voltage: charger.maxKw > 22 ? 920 : 400,
          max_amperage: Math.round((charger.maxKw * 1000) / (charger.maxKw > 22 ? 920 : 400)),
          max_electric_power: charger.maxKw * 1000,
          last_updated: new Date().toISOString(),
        }],
        last_updated: new Date().toISOString(),
      })),
      last_updated: new Date().toISOString(),
    }));
    
    return {
      data: locations,
      status_code: 1000,
      status_message: 'Success',
      timestamp: new Date().toISOString(),
    };
  });

  // Tokens endpoint (for CPO to validate tokens)
  fastify.get('/2.2.1/tokens/:tokenUid', async (request, reply) => {
    const { tokenUid } = request.params as { tokenUid: string };
    
    const token = await fastify.prisma.ocpiToken.findUnique({
      where: { uid: tokenUid },
      include: { user: true },
    });
    
    if (!token) {
      return reply.status(404).send({
        data: null,
        status_code: 2004,
        status_message: 'Token not found',
        timestamp: new Date().toISOString(),
      });
    }
    
    return {
      data: {
        country_code: 'NL',
        party_id: process.env.OCPI_PARTY_ID || 'CTP',
        uid: token.uid,
        type: token.type,
        contract_id: token.authId,
        visual_number: token.visualNumber,
        issuer: token.issuer,
        group_id: token.groupId,
        valid: token.valid,
        whitelist: token.whitelist,
        last_updated: token.lastUpdated.toISOString(),
      },
      status_code: 1000,
      status_message: 'Success',
      timestamp: new Date().toISOString(),
    };
  });

  // Sessions endpoint
  fastify.get('/2.2.1/sessions', async (request) => {
    const query = request.query as { date_from?: string; date_to?: string; offset?: string; limit?: string };
    const limit = parseInt(query.limit || '100');
    const offset = parseInt(query.offset || '0');
    
    const sessions = await fastify.prisma.session.findMany({
      where: {
        ocpiSessionId: { not: null },
      },
      include: {
        station: true,
        charger: true,
      },
      skip: offset,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
    
    const ocpiSessions = sessions.map(session => ({
      country_code: 'NL',
      party_id: process.env.OCPI_PARTY_ID || 'CTP',
      id: session.ocpiSessionId,
      start_date_time: session.startedAt?.toISOString(),
      end_date_time: session.endedAt?.toISOString(),
      kwh: session.deliveredKwh,
      auth_method: 'AUTH_REQUEST',
      location: {
        id: session.stationId,
        name: session.station.name,
      },
      evse_uid: session.charger.ocpiEvseUid,
      connector_id: session.charger.ocpiConnectorId,
      currency: 'EUR',
      total_cost: session.totalCostCents / 100,
      status: session.status === 'CHARGING' ? 'ACTIVE' :
              session.status === 'ENDED' ? 'COMPLETED' : 'PENDING',
      last_updated: session.updatedAt.toISOString(),
    }));
    
    return {
      data: ocpiSessions,
      status_code: 1000,
      status_message: 'Success',
      timestamp: new Date().toISOString(),
    };
  });

  // CDRs endpoint
  fastify.get('/2.2.1/cdrs', async (request) => {
    const query = request.query as { date_from?: string; date_to?: string; offset?: string; limit?: string };
    const limit = parseInt(query.limit || '100');
    const offset = parseInt(query.offset || '0');
    
    const cdrs = await fastify.prisma.ocpiCdr.findMany({
      include: { session: true },
      skip: offset,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
    
    return {
      data: cdrs.map(cdr => ({
        country_code: 'NL',
        party_id: process.env.OCPI_PARTY_ID || 'CTP',
        id: cdr.cdrId,
        start_date_time: cdr.startDateTime.toISOString(),
        end_date_time: cdr.endDateTime.toISOString(),
        session_id: cdr.sessionId,
        auth_method: cdr.authMethod,
        location: {
          id: cdr.locationId,
          evse_uid: cdr.evseUid,
          connector_id: cdr.connectorId,
        },
        currency: cdr.currency,
        total_cost: cdr.totalCost,
        total_energy: cdr.totalKwh,
        total_parking_time: cdr.totalParkingTime,
        last_updated: cdr.createdAt.toISOString(),
      })),
      status_code: 1000,
      status_message: 'Success',
      timestamp: new Date().toISOString(),
    };
  });

  // Commands - for receiving async responses from CPO
  fastify.post('/2.2.1/commands/:commandId/response', async (request, reply) => {
    const { commandId } = request.params as { commandId: string };
    const body = request.body as { result: string; message?: string };
    
    const command = await fastify.prisma.ocpiCommand.findUnique({
      where: { id: commandId },
    });
    
    if (!command) {
      return reply.status(404).send({
        status_code: 2004,
        status_message: 'Command not found',
        timestamp: new Date().toISOString(),
      });
    }
    
    await fastify.prisma.ocpiCommand.update({
      where: { id: commandId },
      data: {
        status: body.result === 'ACCEPTED' ? 'ACCEPTED' : 'REJECTED',
        result: body.message || body.result,
      },
    });
    
    return {
      status_code: 1000,
      status_message: 'Success',
      timestamp: new Date().toISOString(),
    };
  });
};

export default ocpiRoutes;
