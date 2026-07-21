export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string | null;
          display_name: string | null;
          email: string | null;
          avatar_url: string | null;
          role: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username?: string | null;
          display_name?: string | null;
          email?: string | null;
          avatar_url?: string | null;
          role?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          username?: string | null;
          display_name?: string | null;
          email?: string | null;
          avatar_url?: string | null;
          role?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      anime: {
        Row: {
          id: number;
          anilist_id: number | null;
          source_fingerprint: string | null;
          source_provider: string | null;
          source_urls: string[] | null;
          title_display: string;
          title_normalized: string;
          title_english: string | null;
          title_romaji: string | null;
          title_native: string | null;
          synonyms: string[] | null;
          studios: string[] | null;
          tags: string[] | null;
          cover_image: string | null;
          banner_image: string | null;
          format: string | null;
          status: string | null;
          episodes: number | null;
          country_of_origin: string | null;
          season: string | null;
          season_year: number | null;
          average_score: number | null;
          popularity: number | null;
          description: string | null;
          genres: string[] | null;
          site_url: string | null;
          metadata_tier: string;
          last_synced_at: string;
          detail_synced_at: string | null;
          row_version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          anilist_id?: number | null;
          source_fingerprint?: string | null;
          source_provider?: string | null;
          source_urls?: string[] | null;
          title_display: string;
          title_normalized: string;
          title_english?: string | null;
          title_romaji?: string | null;
          title_native?: string | null;
          synonyms?: string[] | null;
          studios?: string[] | null;
          tags?: string[] | null;
          cover_image?: string | null;
          banner_image?: string | null;
          format?: string | null;
          status?: string | null;
          episodes?: number | null;
          country_of_origin?: string | null;
          season?: string | null;
          season_year?: number | null;
          average_score?: number | null;
          popularity?: number | null;
          description?: string | null;
          genres?: string[] | null;
          site_url?: string | null;
          metadata_tier?: string;
          last_synced_at?: string;
          detail_synced_at?: string | null;
          row_version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          anilist_id?: number | null;
          source_fingerprint?: string | null;
          source_provider?: string | null;
          source_urls?: string[] | null;
          title_display?: string;
          title_normalized?: string;
          title_english?: string | null;
          title_romaji?: string | null;
          title_native?: string | null;
          synonyms?: string[] | null;
          studios?: string[] | null;
          tags?: string[] | null;
          cover_image?: string | null;
          banner_image?: string | null;
          format?: string | null;
          status?: string | null;
          episodes?: number | null;
          country_of_origin?: string | null;
          season?: string | null;
          season_year?: number | null;
          average_score?: number | null;
          popularity?: number | null;
          description?: string | null;
          genres?: string[] | null;
          site_url?: string | null;
          metadata_tier?: string;
          last_synced_at?: string;
          detail_synced_at?: string | null;
          row_version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_anime: {
        Row: {
          id: number;
          user_id: string;
          anime_id: number;
          list_status: string;
          progress: number;
          score: number | null;
          notes: string | null;
          priority: number | null;
          added_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          anime_id: number;
          list_status: string;
          progress?: number;
          score?: number | null;
          notes?: string | null;
          priority?: number | null;
          added_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          anime_id?: number;
          list_status?: string;
          progress?: number;
          score?: number | null;
          notes?: string | null;
          priority?: number | null;
          added_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      sync_runs: {
        Row: {
          id: number;
          job_type: string;
          status: string;
          scope: Json;
          processed_count: number;
          inserted_count: number;
          updated_count: number;
          error_message: string | null;
          started_at: string;
          finished_at: string | null;
        };
        Insert: {
          id?: number;
          job_type: string;
          status: string;
          scope?: Json;
          processed_count?: number;
          inserted_count?: number;
          updated_count?: number;
          error_message?: string | null;
          started_at?: string;
          finished_at?: string | null;
        };
        Update: {
          id?: number;
          job_type?: string;
          status?: string;
          scope?: Json;
          processed_count?: number;
          inserted_count?: number;
          updated_count?: number;
          error_message?: string | null;
          started_at?: string;
          finished_at?: string | null;
        };
        Relationships: [];
      };
      catalog_feed_snapshots: {
        Row: {
          id: number;
          feed_type: string;
          snapshot_date: string;
          page: number;
          items: Json;
          total: number;
          has_next_page: boolean;
          last_page: number;
          item_count: number;
          source: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          feed_type: string;
          snapshot_date: string;
          page?: number;
          items?: Json;
          total?: number;
          has_next_page?: boolean;
          last_page?: number;
          item_count?: number;
          source?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          feed_type?: string;
          snapshot_date?: string;
          page?: number;
          items?: Json;
          total?: number;
          has_next_page?: boolean;
          last_page?: number;
          item_count?: number;
          source?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      catalog_feed_items: {
        Row: {
          id: number;
          feed_type: string;
          snapshot_date: string;
          page: number;
          position: number;
          anime_id: number;
          created_at: string;
        };
        Insert: {
          id?: number;
          feed_type: string;
          snapshot_date: string;
          page?: number;
          position: number;
          anime_id: number;
          created_at?: string;
        };
        Update: {
          id?: number;
          feed_type?: string;
          snapshot_date?: string;
          page?: number;
          position?: number;
          anime_id?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      feed_refresh_state: {
        Row: {
          feed_type: string;
          last_attempted_at: string | null;
          last_succeeded_at: string | null;
          status: string;
          error_message: string | null;
          next_allowed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          feed_type: string;
          last_attempted_at?: string | null;
          last_succeeded_at?: string | null;
          status?: string;
          error_message?: string | null;
          next_allowed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          feed_type?: string;
          last_attempted_at?: string | null;
          last_succeeded_at?: string | null;
          status?: string;
          error_message?: string | null;
          next_allowed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      catalog_feed_refresh_state: {
        Row: {
          feed_type: string;
          page: number;
          status: string;
          lease_token: string | null;
          lease_acquired_at: string | null;
          lease_expires_at: string | null;
          last_attempted_at: string | null;
          last_succeeded_at: string | null;
          failure_count: number;
          next_allowed_at: string | null;
          last_error_code: string | null;
          last_error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          feed_type: string;
          page: number;
          status?: string;
          lease_token?: string | null;
          lease_acquired_at?: string | null;
          lease_expires_at?: string | null;
          last_attempted_at?: string | null;
          last_succeeded_at?: string | null;
          failure_count?: number;
          next_allowed_at?: string | null;
          last_error_code?: string | null;
          last_error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          feed_type?: string;
          page?: number;
          status?: string;
          lease_token?: string | null;
          lease_acquired_at?: string | null;
          lease_expires_at?: string | null;
          last_attempted_at?: string | null;
          last_succeeded_at?: string | null;
          failure_count?: number;
          next_allowed_at?: string | null;
          last_error_code?: string | null;
          last_error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      notification_observations: {
        Row: {
          id: number;
          anime_id: number;
          observation_type: string;
          episode_number: number | null;
          event_occurred_at: string;
          source_feed: string;
          source_snapshot_date: string;
          source_page: number;
          payload: Json;
          status: string;
          attempt_count: number;
          available_at: string;
          processed_at: string | null;
          last_error_code: string | null;
          last_error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          anime_id: number;
          observation_type: string;
          episode_number?: number | null;
          event_occurred_at: string;
          source_feed: string;
          source_snapshot_date: string;
          source_page: number;
          payload?: Json;
          status?: string;
          attempt_count?: number;
          available_at?: string;
          processed_at?: string | null;
          last_error_code?: string | null;
          last_error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          anime_id?: number;
          observation_type?: string;
          episode_number?: number | null;
          event_occurred_at?: string;
          source_feed?: string;
          source_snapshot_date?: string;
          source_page?: number;
          payload?: Json;
          status?: string;
          attempt_count?: number;
          available_at?: string;
          processed_at?: string | null;
          last_error_code?: string | null;
          last_error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      anime_sources: {
        Row: {
          id: number;
          anime_id: number;
          provider: string;
          external_id: string | null;
          source_fingerprint: string | null;
          canonical_url: string | null;
          confidence: string;
          metadata: Json;
          first_seen_at: string;
          last_seen_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          anime_id: number;
          provider: string;
          external_id?: string | null;
          source_fingerprint?: string | null;
          canonical_url?: string | null;
          confidence?: string;
          metadata?: Json;
          first_seen_at?: string;
          last_seen_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          anime_id?: number;
          provider?: string;
          external_id?: string | null;
          source_fingerprint?: string | null;
          canonical_url?: string | null;
          confidence?: string;
          metadata?: Json;
          first_seen_at?: string;
          last_seen_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      anime_event_state: {
        Row: {
          anime_id: number;
          last_episode_number: number | null;
          last_episode_at: string | null;
          episode_initialized: boolean;
          is_completed: boolean;
          completion_initialized: boolean;
          completed_at: string | null;
          last_checked_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          anime_id: number;
          last_episode_number?: number | null;
          last_episode_at?: string | null;
          episode_initialized?: boolean;
          is_completed?: boolean;
          completion_initialized?: boolean;
          completed_at?: string | null;
          last_checked_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          anime_id?: number;
          last_episode_number?: number | null;
          last_episode_at?: string | null;
          episode_initialized?: boolean;
          is_completed?: boolean;
          completion_initialized?: boolean;
          completed_at?: string | null;
          last_checked_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      anime_events: {
        Row: {
          id: number;
          anime_id: number;
          event_type: string;
          episode_number: number | null;
          event_occurred_at: string;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: number;
          anime_id: number;
          event_type: string;
          episode_number?: number | null;
          event_occurred_at: string;
          payload?: Json;
          created_at?: string;
        };
        Update: {
          id?: number;
          anime_id?: number;
          event_type?: string;
          episode_number?: number | null;
          event_occurred_at?: string;
          payload?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      user_notification_preferences: {
        Row: {
          user_id: string;
          new_episode_enabled: boolean;
          anime_completed_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          new_episode_enabled?: boolean;
          anime_completed_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          new_episode_enabled?: boolean;
          anime_completed_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_notifications: {
        Row: {
          id: number;
          user_id: string;
          anime_event_id: number;
          anime_id: number;
          type: string;
          title: string;
          message: string;
          is_read: boolean;
          created_at: string;
          read_at: string | null;
        };
        Insert: {
          id?: number;
          user_id: string;
          anime_event_id: number;
          anime_id: number;
          type: string;
          title: string;
          message: string;
          is_read?: boolean;
          created_at?: string;
          read_at?: string | null;
        };
        Update: {
          id?: number;
          user_id?: string;
          anime_event_id?: number;
          anime_id?: number;
          type?: string;
          title?: string;
          message?: string;
          is_read?: boolean;
          created_at?: string;
          read_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      try_acquire_catalog_feed_lease: {
        Args: {
          p_feed_type: string;
          p_page: number;
          p_lease_token: string;
          p_lease_seconds?: number;
        };
        Returns: Json;
      };
      fail_catalog_feed_refresh: {
        Args: {
          p_feed_type: string;
          p_page: number;
          p_lease_token: string;
          p_error_code: string;
          p_error_message: string;
        };
        Returns: boolean;
      };
      commit_catalog_feed_refresh: {
        Args: {
          p_feed_type: string;
          p_page: number;
          p_snapshot_date: string;
          p_total: number;
          p_has_next_page: boolean;
          p_last_page: number;
          p_lease_token: string;
          p_items: Json;
        };
        Returns: Json;
      };
      commit_catalog_feed_refresh_v2: {
        Args: {
          p_feed_type: string;
          p_page: number;
          p_snapshot_date: string;
          p_total: number;
          p_has_next_page: boolean;
          p_last_page: number;
          p_lease_token: string;
          p_items: Json;
          p_observations?: Json;
        };
        Returns: Json;
      };
      read_catalog_feed_candidates: {
        Args: {
          p_feed_type: string;
          p_page: number;
          p_limit?: number;
        };
        Returns: Json;
      };
      process_notification_observation_batch: {
        Args: {
          p_limit?: number;
        };
        Returns: Json;
      };
      list_notification_tracking_targets_v1: {
        Args: {
          p_after_anime_id?: number;
          p_limit?: number;
        };
        Returns: Array<{
          anime_id: number;
          anilist_id: number;
        }>;
      };
      enqueue_notification_observation_batch_v1: {
        Args: {
          p_observations: Json;
          p_source_run_id?: number | null;
        };
        Returns: Json;
      };
      upsert_anilist_anime_batch_v1: {
        Args: {
          p_records: Json;
          p_metadata_tier: string;
        };
        Returns: Json;
      };
      upsert_offline_anime_batch_v1: {
        Args: {
          p_records: Json;
        };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
