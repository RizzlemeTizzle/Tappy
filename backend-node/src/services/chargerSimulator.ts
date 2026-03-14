import { PrismaClient } from '@prisma/client';

interface SimulatorSession {
  startTime: Date;
  maxPowerKw: number;
  stopped: boolean;
  chargingCompleteAt?: Date;
  frozenDeliveredKwh?: number;
  frozenCurrentPowerKw?: number;
  frozenEnergyCostCents?: number;
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
      
      // Calculate costs (will be overridden by frozen values after completion)
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
        simSession.frozenDeliveredKwh = Math.round(deliveredKwh * 1000) / 1000;
        simSession.frozenEnergyCostCents = Math.floor(deliveredKwh * session.pricingEnergyRateCents);
        simSession.frozenCurrentPowerKw = 0;
        newStatus = 'COMPLETE';

        // Update charger status
        await this.prisma.charger.update({
          where: { id: session.chargerId },
          data: { status: 'COMPLETE' },
        });
      }

      // Use frozen values once charging is complete so energy cost doesn't keep rising
      const finalDeliveredKwh = simSession.frozenDeliveredKwh ?? deliveredKwh;
      const finalCurrentPowerKw = simSession.frozenCurrentPowerKw ?? currentPower;
      const finalEnergyCostCents = simSession.frozenEnergyCostCents ?? energyCostCents;

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
      
      // Calculate tax and total using frozen energy cost once charging is complete
      const finalSubtotal = session.pricingStartFeeCents + finalEnergyCostCents;
      const subtotalWithPenalty = finalSubtotal + penaltyCostCents;
      const taxCents = Math.floor(subtotalWithPenalty * session.pricingTaxPercent / 100);
      const totalCostCents = subtotalWithPenalty + taxCents;

      // Update session
      await this.prisma.session.update({
        where: { id: sessionId },
        data: {
          deliveredKwh: finalDeliveredKwh,
          currentPowerKw: Math.round(finalCurrentPowerKw * 10) / 10,
          batteryPercent,
          energyCostCents: finalEnergyCostCents,
          penaltyMinutes,
          penaltyCostCents,
          taxCents,
          totalCostCents,
          meterEndKwh: session.meterStartKwh + finalDeliveredKwh,
          status: newStatus,
          chargingCompleteAt,
        },
      });
    } catch (error) {
      console.error(`Error updating session ${sessionId}:`, error);
    }
  }
}
