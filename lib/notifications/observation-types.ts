import type { Json } from "@/lib/supabase/database.types";

export type NotificationType = "new_episode" | "anime_completed";

export type NotificationObservation = {
  observation_type: NotificationType;
  anilist_id: number;
  episode_number: number | null;
  event_occurred_at: string;
  payload: Json;
} & Record<string, Json | undefined>;

export interface NotificationBatchResult {
  status: "processed" | "busy";
  processed: number;
  baselined: number;
  ignored: number;
  eventsCreated: number;
  notificationsCreated: number;
  retried: number;
  deadLettered: number;
  remaining: number;
}
