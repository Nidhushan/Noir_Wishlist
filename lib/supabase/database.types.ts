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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
