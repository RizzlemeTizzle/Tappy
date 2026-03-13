import { PrismaClient } from '@prisma/client';

interface SimulatorSession {
  startTime: Date;
  maxPowerKw: number;
  stopped: boolean;
  chargingCompleteAt?: Date;
}

export class ChargerSimulator {
  private sessions: Map<string, SimulatorSession> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  startSimulation(sessionId: string, maxPowerKw: number) {
    console.log(`Starting charging simulation for session ${sessionId}`);
    
    this.sessions.set(sessionId, {
      startTime: new Date(),
      maxPowerKw,
      stopped: false,
    });

    // Update every 5 seconds — reduces DB write load significantly at scale
    const interval = setInterval(() => this.updateSession(sessionId), 5000);
    this.intervals.set(sessionId, interval);
  }

  stopSimulation(sessionId: string) {
    console.log(`Stopping charging simulation for session ${sessionId}`);
    
    const session = this.sessions.get(sessionId);
    if (session) {
      session.stopped = true;
    }
    
    const interval = this.intervals.get(sessionId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(sessionId);
    }
    
    this.sessions.delete(sessionId);
  }

  private async updateSession(sessionId: string) {
    const simSession = this.sessions.get(sessionId);
    if (!simSession || simSession.stopped) {
      this.stopSimulation(sessionId);
      return;
    }

    try {
      const session = await this.prisma.session.findUnique({
        where: { id: sessionId },
        include: { charger: true },
      });

      if (!session || session.status === 'ENDED') {
        this.stopSimulation(sessionId);
        return;
      }

      const elapsedSeconds = (Date.now() - simSession.startTime.getTime()) / 1000;
      
      // Ramp up power over first 30 seconds
      const rampFactor = Math.min(1.0, elapsedSeconds / 30);
      const currentPower = simSession.maxPowerKw * rampFactor * (0.9 + Math.random() * 0.1);
      
      // Calculate energy delivered (kWh = kW * hours)
      const hours = elapsedSeconds / 3600;
      const deliveredKwh = simSession.maxPowerKw * rampFactor * hours * 0.85;
      
      // Simulate battery percentage
      const batteryPercent = Math.min(100, Math.floor(20 + (deliveredKwh / 60) * 100));
      
      // Calculate costs
      const energyCostCents = Math.floor(deliveredKwh * session.pricingEnergyRateCents);
      let subtotal = session.pricingStartFeeCents + energyCostCents;
      
      let penaltyCostCents = 0;
      let penaltyMinutes = 0;
      let newStatus = session.status;
      let chargingCompleteAt = session.chargingCompleteAt;
      
      // Check if charging complete
      if (batteryPercent >= 100 && !chargingCompleteAt) {
        chargingCompleteAt = new Date();
        simSession.chargingCompleteAt = chargingCompleteAt;
        newStatus = 'COMPLETE';
        
        // Update charger status
        await this.prisma.charger.update({
          where: { id: session.chargerId },
          data: { status: 'COMPLETE' },
        });
      }
      
      // Calculate penalty if applicable
      if (chargingCompleteAt && session.pricingPenaltyEnabled) {
        const idleMinutes = (Date.now() - chargingCompleteAt.getTime()) / 60000;
        const graceMinutes = session.pricingPenaltyGraceMin;
        
        if (idleMinutes > graceMinutes) {
          penaltyMinutes = Math.floor(idleMinutes - graceMinutes);
          penaltyCostCents = penaltyMinutes * session.pricingPenaltyCentsPerMin;
          
          // Apply daily cap if exists
          if (session.pricingPenaltyCapCents) {
            penaltyCostCents = Math.min(penaltyCostCents, session.pricingPenaltyCapCents);
          }
          
          if (penaltyMinutes > 0 && newStatus !== 'IDLE') {
            newStatus = 'IDLE';
            await this.prisma.charger.update({
              where: { id: session.chargerId },
              data: { status: 'IDLE' },
            });
          }
        }
      }
      
      // Calculate tax and total
      const subtotalWithPenalty = subtotal + penaltyCostCents;
      const taxCents = Math.floor(subtotalWithPenalty * session.pricingTaxPercent / 100);
      const totalCostCents = subtotalWithPenalty + taxCents;
      
      // Update session
      await this.prisma.session.update({
        where: { id: sessionId },
        data: {
          deliveredKwh: Math.round(deliveredKwh * 1000) / 1000,
          currentPowerKw: Math.round(currentPower * 10) / 10,
          batteryPercent,
          energyCostCents,
          penaltyMinutes,
          penaltyCostCents,
          taxCents,
          totalCostCents,
          meterEndKwh: session.meterStartKwh + deliveredKwh,
          status: newStatus,
          chargingCompleteAt,
        },
      });
    } catch (error) {
      console.error(`Error updating session ${sessionId}:`, error);
    }
  }
}
