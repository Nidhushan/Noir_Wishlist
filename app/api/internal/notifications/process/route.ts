import { timingSafeEqual } from "node:crypto";

import { getCronSecret } from "@/lib/env";
import { collectTrackedAnimeNotifications } from "@/lib/notifications/collector";
import { processNotificationObservationBatch } from "@/lib/notifications/worker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function secretsMatch(received: string | null, expected: string): boolean {
  const expectedHeader = `Bearer ${expected}`;

  if (!received) {
    return false;
  }

  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expectedHeader);

  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

export async function GET(request: Request): Promise<Response> {
  const cronSecret = getCronSecret();

  if (!cronSecret || !secretsMatch(request.headers.get("authorization"), cronSecret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let collection: Awaited<ReturnType<typeof collectTrackedAnimeNotifications>> | null = null;
    let collectionFailed = false;

    try {
      collection = await collectTrackedAnimeNotifications();
    } catch (error) {
      collectionFailed = true;
      console.error("notifications.collection.cron_failed", {
        error: error instanceof Error ? error.message : "Unknown notification collection error",
      });
    }

    const totals = {
      processed: 0,
      baselined: 0,
      ignored: 0,
      eventsCreated: 0,
      notificationsCreated: 0,
      retried: 0,
      deadLettered: 0,
    };
    let remaining = 0;
    let status: "processed" | "busy" = "processed";

    for (let batch = 0; batch < 5; batch += 1) {
      const result = await processNotificationObservationBatch();
      status = result.status;
      remaining = result.remaining;

      for (const key of Object.keys(totals) as Array<keyof typeof totals>) {
        totals[key] += result[key];
      }

      if (result.status === "busy" || result.remaining === 0 || result.processed === 0) {
        break;
      }
    }

    const response = {
      status: collectionFailed ? "collection_failed" : status,
      collection,
      ...totals,
      remaining,
    };

    return Response.json(response, { status: collectionFailed ? 502 : 200 });
  } catch (error) {
    console.error("notifications.observation.cron_failed", {
      error: error instanceof Error ? error.message : "Unknown notification processing error",
    });
    return Response.json({ error: "Notification processing failed." }, { status: 500 });
  }
}
