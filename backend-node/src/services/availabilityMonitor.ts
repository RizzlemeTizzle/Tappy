import { PrismaClient } from '@prisma/client';
import Expo, { ExpoPushMessage } from 'expo-server-sdk';

const expo = new Expo();
const POLL_INTERVAL_MS = 90_000; // 90 seconds

export function startAvailabilityMonitor(prisma: PrismaClient): NodeJS.Timeout {
  console.log('🔔 Availability monitor started (polling every 90s)');

  return setInterval(async () => {
    try {
      // Find all pending alert requests grouped by station
      const alertsByStation = await prisma.availabilityAlertRequest.findMany({
        include: {
          user: { select: { expoPushToken: true } },
          station: { select: { id: true, name: true, chargers: { select: { status: true } } } },
        },
      });

      if (alertsByStation.length === 0) return;

      // Group by stationId so we only check each station once
      const stationMap = new Map<string, typeof alertsByStation>();
      for (const alert of alertsByStation) {
        const existing = stationMap.get(alert.stationId) ?? [];
        existing.push(alert);
        stationMap.set(alert.stationId, existing);
      }

      const alertIdsToDelete: string[] = [];
      const messages: ExpoPushMessage[] = [];

      for (const [, alerts] of stationMap) {
        const station = alerts[0].station;
        const hasAvailable = station.chargers.some((c) => c.status === 'AVAILABLE');
        if (!hasAvailable) continue;

        // Charger is available — notify all waiting users and clear their alerts
        for (const alert of alerts) {
          alertIdsToDelete.push(alert.id);
          const token = alert.user.expoPushToken;
          if (!token || !Expo.isExpoPushToken(token)) continue;

          messages.push({
            to: token,
            sound: 'default',
            title: 'Charger Available!',
            body: `A charger is now available at ${station.name}.`,
            data: { stationId: station.id },
          });
        }
      }

      // Delete fulfilled alert requests
      if (alertIdsToDelete.length > 0) {
        await prisma.availabilityAlertRequest.deleteMany({
          where: { id: { in: alertIdsToDelete } },
        });
      }

      // Send push notifications in chunks
      if (messages.length > 0) {
        const chunks = expo.chunkPushNotifications(messages);
        for (const chunk of chunks) {
          await expo.sendPushNotificationsAsync(chunk);
        }
        console.log(`🔔 Sent ${messages.length} availability notification(s)`);
      }
    } catch (err) {
      console.error('Availability monitor error:', err);
    }
  }, POLL_INTERVAL_MS);
}
