import { FastifyPluginAsync } from 'fastify';
import { v4 as uuid } from 'uuid';

const stationConfigs = [
  // Downtown Rotterdam - Fast chargers, moderate pricing
  { name: 'Rotterdam Centraal', address: 'Stationsplein 1, Rotterdam', lat: 51.9244, lng: 4.4692, type: 'fast', chargers: [['CCS', 150], ['CCS', 150], ['CHAdeMO', 100]] },
  { name: 'Markthal Charging Hub', address: 'Dominee Jan Scharpstraat 298, Rotterdam', lat: 51.9200, lng: 4.4863, type: 'fast', chargers: [['CCS', 100], ['CCS', 100]] },
  { name: 'Erasmusbrug Plaza', address: 'Erasmusbrug, Rotterdam', lat: 51.9094, lng: 4.4868, type: 'fast', chargers: [['CCS', 150], ['Type2', 22]] },
  { name: 'Euromast Parking', address: 'Parkhaven 20, Rotterdam', lat: 51.9054, lng: 4.4666, type: 'standard', chargers: [['CCS', 50], ['Type2', 22], ['Type2', 22]] },
  { name: 'Kop van Zuid', address: 'Wilhelminakade 137, Rotterdam', lat: 51.9028, lng: 4.4896, type: 'premium', chargers: [['CCS', 350], ['CCS', 350]] },
  
  // Noord Rotterdam
  { name: 'Blijdorp Zoo Charge', address: 'Blijdorplaan 8, Rotterdam', lat: 51.9285, lng: 4.4488, type: 'standard', chargers: [['Type2', 22], ['Type2', 22], ['Type2', 11]] },
  { name: 'Schiebroek Hub', address: 'Wilgenplaslaan 56, Rotterdam', lat: 51.9467, lng: 4.4683, type: 'budget', chargers: [['Type2', 11], ['Type2', 11]] },
  { name: 'Hillegersberg Charge', address: 'Straatweg 190, Rotterdam', lat: 51.9512, lng: 4.4829, type: 'budget', chargers: [['Type2', 22], ['Type2', 22]] },
  
  // Zuid Rotterdam
  { name: 'Zuidplein Mall', address: 'Zuidplein 100, Rotterdam', lat: 51.8804, lng: 4.4835, type: 'standard', chargers: [['CCS', 50], ['CCS', 50], ['Type2', 22]] },
  { name: 'Ahoy Rotterdam', address: 'Ahoyweg 10, Rotterdam', lat: 51.8848, lng: 4.4941, type: 'fast', chargers: [['CCS', 150], ['CCS', 150], ['CHAdeMO', 100]] },
  { name: 'Feyenoord Stadium', address: 'Van Zandvlietplein 1, Rotterdam', lat: 51.8939, lng: 4.5231, type: 'fast', chargers: [['CCS', 100], ['CCS', 100]] },
  { name: 'Charlois Point', address: 'Groene Hilledijk 315, Rotterdam', lat: 51.8830, lng: 4.4599, type: 'budget', chargers: [['Type2', 22]] },
  
  // Oost Rotterdam
  { name: 'Kralingen Charge', address: 'Kralingse Plaslaan 1, Rotterdam', lat: 51.9303, lng: 4.5088, type: 'standard', chargers: [['CCS', 50], ['Type2', 22]] },
  { name: 'Alexander Station', address: 'Alexander, Rotterdam', lat: 51.9516, lng: 4.5532, type: 'fast', chargers: [['CCS', 150], ['CCS', 100], ['CHAdeMO', 50]] },
  { name: 'Ommoord Hub', address: 'Ommoord, Rotterdam', lat: 51.9608, lng: 4.5324, type: 'budget', chargers: [['Type2', 11], ['Type2', 11], ['Type2', 11]] },
  { name: 'Capelle Noord', address: 'Capelle aan den IJssel', lat: 51.9331, lng: 4.5757, type: 'standard', chargers: [['CCS', 50], ['Type2', 22]] },
  
  // West Rotterdam
  { name: 'Delfshaven Historic', address: 'Delfshaven, Rotterdam', lat: 51.9058, lng: 4.4468, type: 'budget', chargers: [['Type2', 22], ['Type2', 22]] },
  { name: 'Spangen Charge', address: 'Spangen, Rotterdam', lat: 51.9120, lng: 4.4320, type: 'budget', chargers: [['Type2', 11]] },
  { name: 'Schiedam Centrum', address: 'Broersveld, Schiedam', lat: 51.9177, lng: 4.3994, type: 'standard', chargers: [['CCS', 50], ['Type2', 22], ['Type2', 22]] },
  { name: 'Vlaardingen Hub', address: 'Hoogstraat, Vlaardingen', lat: 51.9122, lng: 4.3408, type: 'fast', chargers: [['CCS', 100], ['CCS', 100]] },
  
  // Surrounding areas
  { name: 'Barendrecht Park', address: 'Barendrecht', lat: 51.8571, lng: 4.5339, type: 'budget', chargers: [['Type2', 22], ['Type2', 22]] },
  { name: 'Ridderkerk Station', address: 'Ridderkerk', lat: 51.8698, lng: 4.5935, type: 'standard', chargers: [['CCS', 50], ['Type2', 22]] },
  { name: 'Hoogvliet Center', address: 'Hoogvliet, Rotterdam', lat: 51.8628, lng: 4.3533, type: 'standard', chargers: [['CCS', 50], ['Type2', 11]] },
  { name: 'Pernis Industrial', address: 'Pernis, Rotterdam', lat: 51.8836, lng: 4.3866, type: 'fast', chargers: [['CCS', 150], ['CCS', 100]] },
  { name: 'Rozenburg Port', address: 'Rozenburg', lat: 51.9003, lng: 4.2583, type: 'budget', chargers: [['Type2', 22]] },
  
  // Highway stations
  { name: 'A16 Fastcharge North', address: 'A16 Northbound', lat: 51.9756, lng: 4.5194, type: 'premium', chargers: [['CCS', 350], ['CCS', 350], ['CCS', 150]] },
  { name: 'A15 Truckers Stop', address: 'A15 Europoort', lat: 51.8936, lng: 4.3194, type: 'fast', chargers: [['CCS', 150], ['CCS', 150], ['CHAdeMO', 100]] },
  { name: 'A20 Charging Plaza', address: 'A20 Westbound', lat: 51.9256, lng: 4.3458, type: 'fast', chargers: [['CCS', 150], ['CCS', 100]] },
  { name: 'A4 Service Station', address: 'A4 Direction Den Haag', lat: 51.9892, lng: 4.3994, type: 'fast', chargers: [['CCS', 150], ['CCS', 150], ['CHAdeMO', 100], ['Type2', 22]] },
  
  // Shopping centers
  { name: 'Alexandrium Mall', address: 'Alexandrium, Rotterdam', lat: 51.9537, lng: 4.5478, type: 'standard', chargers: [['CCS', 50], ['CCS', 50], ['Type2', 22], ['Type2', 22]] },
  { name: 'The Hague IKEA', address: 'IKEA Den Haag', lat: 52.0477, lng: 4.3826, type: 'standard', chargers: [['CCS', 50], ['Type2', 22], ['Type2', 22], ['Type2', 22]] },
];

const pricingTemplates: Record<string, any> = {
  budget: {
    startFeeCents: 0,
    energyRateCentsPerKwh: 25,
    penaltyEnabled: false,
    penaltyGraceMinutes: 0,
    penaltyCentsPerMinute: 0,
    penaltyDailyCapCents: null,
    taxPercent: 21.0,
  },
  standard: {
    startFeeCents: 50,
    energyRateCentsPerKwh: 35,
    penaltyEnabled: true,
    penaltyGraceMinutes: 30,
    penaltyCentsPerMinute: 25,
    penaltyDailyCapCents: 2500,
    taxPercent: 21.0,
  },
  fast: {
    startFeeCents: 100,
    energyRateCentsPerKwh: 45,
    penaltyEnabled: true,
    penaltyGraceMinutes: 15,
    penaltyCentsPerMinute: 50,
    penaltyDailyCapCents: 3000,
    taxPercent: 21.0,
  },
  premium: {
    startFeeCents: 200,
    energyRateCentsPerKwh: 59,
    penaltyEnabled: true,
    penaltyGraceMinutes: 10,
    penaltyCentsPerMinute: 100,
    penaltyDailyCapCents: null,
    taxPercent: 21.0,
  },
};

const seedRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/seed', async () => {
    // Clear existing data
    await fastify.prisma.payment.deleteMany({});
    await fastify.prisma.session.deleteMany({});
    await fastify.prisma.ocpiCdr.deleteMany({});
    await fastify.prisma.ocpiCommand.deleteMany({});
    await fastify.prisma.ocpiToken.deleteMany({});
    await fastify.prisma.charger.deleteMany({});
    await fastify.prisma.pricingPlan.deleteMany({});
    await fastify.prisma.station.deleteMany({});
    
    let stationsCreated = 0;
    let chargersCreated = 0;
    
    for (let i = 0; i < stationConfigs.length; i++) {
      const config = stationConfigs[i];
      const stationId = `station-${String(i + 1).padStart(3, '0')}`;
      
      // Create station
      await fastify.prisma.station.create({
        data: {
          id: stationId,
          name: config.name,
          address: config.address,
          latitude: config.lat,
          longitude: config.lng,
        },
      });
      stationsCreated++;
      
      // Create pricing
      const template = pricingTemplates[config.type];
      await fastify.prisma.pricingPlan.create({
        data: {
          id: `pricing-${String(i + 1).padStart(3, '0')}`,
          stationId,
          ...template,
        },
      });
      
      // Create chargers
      for (let j = 0; j < config.chargers.length; j++) {
        const [connector, power] = config.chargers[j] as [string, number];
        
        // Randomize status: 70% available, 20% charging, 10% faulted
        const rand = Math.random();
        let status = 'AVAILABLE';
        if (rand >= 0.7 && rand < 0.9) {
          status = 'CHARGING';
        } else if (rand >= 0.9) {
          status = 'FAULTED';
        }
        
        await fastify.prisma.charger.create({
          data: {
            id: `charger-${String(i + 1).padStart(3, '0')}-${String.fromCharCode(97 + j)}`,
            stationId,
            connectorType: connector,
            maxKw: power,
            status,
            nfcPayload: `CHARGETAP-${String(i + 1).padStart(3, '0')}-${String.fromCharCode(65 + j)}`,
            ocpiEvseUid: `NL*CTP*E${String(i + 1).padStart(5, '0')}*${j + 1}`,
            ocpiConnectorId: String(j + 1),
          },
        });
        chargersCreated++;
      }
    }
    
    return {
      message: 'Demo data seeded successfully',
      stations: stationsCreated,
      chargers: chargersCreated,
      location: 'Rotterdam, Netherlands',
    };
  });

  // Availability simulator
  fastify.post('/simulate/availability', async () => {
    const chargers = await fastify.prisma.charger.findMany({
      where: { currentSessionId: null },
    });
    
    let updated = 0;
    for (const charger of chargers) {
      // 30% chance to change status
      if (Math.random() < 0.3) {
        const rand = Math.random();
        let newStatus = 'AVAILABLE';
        if (rand >= 0.7 && rand < 0.9) {
          newStatus = 'CHARGING';
        } else if (rand >= 0.9) {
          newStatus = 'FAULTED';
        }
        
        if (newStatus !== charger.status) {
          await fastify.prisma.charger.update({
            where: { id: charger.id },
            data: { status: newStatus },
          });
          updated++;
        }
      }
    }
    
    return { message: `Updated ${updated} charger statuses` };
  });
};

export default seedRoutes;
