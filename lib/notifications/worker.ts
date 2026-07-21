import { getNotificationBatchSize } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import type { NotificationBatchResult } from "./observation-types";

function asNonNegativeInteger(value: unknown): number | null {
  return Number.isInteger(value) && (value as number) >= 0 ? (value as number) : null;
}

function parseBatchResult(value: unknown): NotificationBatchResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Notification processor returned an invalid response.");
  }

  const record = value as Record<string, unknown>;
  const status = record.status;
  const fields = [
    "processed",
    "baselined",
    "ignored",
    "eventsCreated",
    "notificationsCreated",
    "retried",
    "deadLettered",
    "remaining",
  ] as const;

  if (status !== "processed" && status !== "busy") {
    throw new Error("Notification processor returned an unknown status.");
  }

  const counts = Object.fromEntries(
    fields.map((field) => [field, asNonNegativeInteger(record[field])]),
  ) as Record<(typeof fields)[number], number | null>;

  if (fields.some((field) => counts[field] === null)) {
    throw new Error("Notification processor returned invalid counters.");
  }

  return {
    status,
    processed: counts.processed as number,
    baselined: counts.baselined as number,
    ignored: counts.ignored as number,
    eventsCreated: counts.eventsCreated as number,
    notificationsCreated: counts.notificationsCreated as number,
    retried: counts.retried as number,
    deadLettered: counts.deadLettered as number,
    remaining: counts.remaining as number,
  };
}

export async function processNotificationObservationBatch(
  limit = getNotificationBatchSize(),
): Promise<NotificationBatchResult> {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    throw new Error("Persistent notification processing is unavailable.");
  }

  const { data, error } = await supabase.rpc("process_notification_observation_batch", {
    p_limit: limit,
  });

  if (error) {
    throw new Error("Notification observation processing failed.", { cause: error });
  }

  return parseBatchResult(data);
}
