export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      app_super_admins: {
        Row: {
          created_at: string
          created_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      pelada_admins: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          pelada_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          pelada_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          pelada_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pelada_admins_pelada_id_fkey"
            columns: ["pelada_id"]
            isOneToOne: false
            referencedRelation: "peladas"
            referencedColumns: ["id"]
          },
        ]
      }
      pelada_automatic_admins: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      pelada_automatic_members: {
        Row: {
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      pelada_bans: {
        Row: {
          banned_at: string
          banned_by: string | null
          expires_at: string | null
          id: string
          pelada_id: string
          reason: string | null
          user_id: string
        }
        Insert: {
          banned_at?: string
          banned_by?: string | null
          expires_at?: string | null
          id?: string
          pelada_id: string
          reason?: string | null
          user_id: string
        }
        Update: {
          banned_at?: string
          banned_by?: string | null
          expires_at?: string | null
          id?: string
          pelada_id?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pelada_bans_pelada_id_fkey"
            columns: ["pelada_id"]
            isOneToOne: false
            referencedRelation: "peladas"
            referencedColumns: ["id"]
          },
        ]
      }
      pelada_goalkeepers: {
        Row: {
          created_at: string
          id: string
          name: string
          pelada_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          pelada_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          pelada_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pelada_goalkeepers_pelada_id_fkey"
            columns: ["pelada_id"]
            isOneToOne: false
            referencedRelation: "peladas"
            referencedColumns: ["id"]
          },
        ]
      }
      pelada_join_requests: {
        Row: {
          created_at: string
          display_name: string
          id: string
          pelada_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          pelada_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          pelada_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pelada_join_requests_pelada_id_fkey"
            columns: ["pelada_id"]
            isOneToOne: false
            referencedRelation: "peladas"
            referencedColumns: ["id"]
          },
        ]
      }
      pelada_member_guests: {
        Row: {
          admin_selected: boolean | null
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          created_at: string
          guest_name: string
          id: string
          is_waiting: boolean
          pelada_id: string
          pelada_member_id: string
          rejected_at: string | null
          rejected_by: string | null
        }
        Insert: {
          admin_selected?: boolean | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          guest_name: string
          id?: string
          is_waiting?: boolean
          pelada_id: string
          pelada_member_id: string
          rejected_at?: string | null
          rejected_by?: string | null
        }
        Update: {
          admin_selected?: boolean | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          guest_name?: string
          id?: string
          is_waiting?: boolean
          pelada_id?: string
          pelada_member_id?: string
          rejected_at?: string | null
          rejected_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pelada_member_guests_pelada_id_fkey"
            columns: ["pelada_id"]
            isOneToOne: false
            referencedRelation: "peladas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pelada_member_guests_pelada_member_id_fkey"
            columns: ["pelada_member_id"]
            isOneToOne: false
            referencedRelation: "pelada_members"
            referencedColumns: ["id"]
          },
        ]
      }
      pelada_members: {
        Row: {
          admin_selected: boolean | null
          created_at: string
          id: string
          is_automatic_entry: boolean
          is_goalkeeper: boolean
          is_waiting: boolean
          member_avatar_url: string | null
          member_name: string
          pelada_id: string
          priority_score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_selected?: boolean | null
          created_at?: string
          id?: string
          is_automatic_entry?: boolean
          is_goalkeeper?: boolean
          is_waiting?: boolean
          member_avatar_url?: string | null
          member_name: string
          pelada_id: string
          priority_score?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_selected?: boolean | null
          created_at?: string
          id?: string
          is_automatic_entry?: boolean
          is_goalkeeper?: boolean
          is_waiting?: boolean
          member_avatar_url?: string | null
          member_name?: string
          pelada_id?: string
          priority_score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pelada_members_pelada_id_fkey"
            columns: ["pelada_id"]
            isOneToOne: false
            referencedRelation: "peladas"
            referencedColumns: ["id"]
          },
        ]
      }
      pelada_players: {
        Row: {
          created_at: string
          id: string
          is_goalkeeper: boolean
          is_waiting: boolean
          name: string
          pelada_id: string
          position: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_goalkeeper?: boolean
          is_waiting?: boolean
          name: string
          pelada_id: string
          position: number
        }
        Update: {
          created_at?: string
          id?: string
          is_goalkeeper?: boolean
          is_waiting?: boolean
          name?: string
          pelada_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "pelada_players_pelada_id_fkey"
            columns: ["pelada_id"]
            isOneToOne: false
            referencedRelation: "peladas"
            referencedColumns: ["id"]
          },
        ]
      }
      pelada_recent_leaves: {
        Row: {
          left_at: string
          pelada_id: string
          user_id: string
        }
        Insert: {
          left_at?: string
          pelada_id: string
          user_id: string
        }
        Update: {
          left_at?: string
          pelada_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pelada_recent_leaves_pelada_id_fkey"
            columns: ["pelada_id"]
            isOneToOne: false
            referencedRelation: "peladas"
            referencedColumns: ["id"]
          },
        ]
      }
      peladas: {
        Row: {
          confirmations_open_at: string
          created_at: string
          date: string
          draw_done_at: string | null
          draw_done_by: string | null
          draw_result: Json | null
          guest_priority_mode: string
          id: string
          list_priority_mode: string
          location: string
          max_goalkeepers: number
          max_players: number
          num_teams: number
          players_per_team: number
          time: string
          title: string
          user_id: string
        }
        Insert: {
          confirmations_open_at: string
          created_at?: string
          date: string
          draw_done_at?: string | null
          draw_done_by?: string | null
          draw_result?: Json | null
          guest_priority_mode?: string
          id?: string
          list_priority_mode?: string
          location?: string
          max_goalkeepers?: number
          max_players?: number
          num_teams?: number
          players_per_team?: number
          time?: string
          title?: string
          user_id: string
        }
        Update: {
          confirmations_open_at?: string
          created_at?: string
          date?: string
          draw_done_at?: string | null
          draw_done_by?: string | null
          draw_result?: Json | null
          guest_priority_mode?: string
          id?: string
          list_priority_mode?: string
          location?: string
          max_goalkeepers?: number
          max_players?: number
          num_teams?: number
          players_per_team?: number
          time?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      system_bans: {
        Row: {
          banned_at: string
          banned_by: string | null
          expires_at: string | null
          id: string
          reason: string | null
          user_id: string
        }
        Insert: {
          banned_at?: string
          banned_by?: string | null
          expires_at?: string | null
          id?: string
          reason?: string | null
          user_id: string
        }
        Update: {
          banned_at?: string
          banned_by?: string | null
          expires_at?: string | null
          id?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tournament_achievement_catalog: {
        Row: {
          achievement_type: Database["public"]["Enums"]["achievement_type"]
          created_at: string
          description: string | null
          id: string
          metadata: Json
          title: string
          tournament_id: string
          version: number
        }
        Insert: {
          achievement_type: Database["public"]["Enums"]["achievement_type"]
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json
          title: string
          tournament_id: string
          version?: number
        }
        Update: {
          achievement_type?: Database["public"]["Enums"]["achievement_type"]
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json
          title?: string
          tournament_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tournament_achievement_catalog_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_achievements: {
        Row: {
          achievement_catalog_id: string
          achievement_type: Database["public"]["Enums"]["achievement_type"]
          granted_at: string
          granted_by: string | null
          id: string
          team_id: string | null
          tournament_id: string
          user_id: string
          version: number
        }
        Insert: {
          achievement_catalog_id: string
          achievement_type: Database["public"]["Enums"]["achievement_type"]
          granted_at?: string
          granted_by?: string | null
          id?: string
          team_id?: string | null
          tournament_id: string
          user_id: string
          version: number
        }
        Update: {
          achievement_catalog_id?: string
          achievement_type?: Database["public"]["Enums"]["achievement_type"]
          granted_at?: string
          granted_by?: string | null
          id?: string
          team_id?: string | null
          tournament_id?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tournament_achievements_achievement_catalog_id_fkey"
            columns: ["achievement_catalog_id"]
            isOneToOne: false
            referencedRelation: "tournament_achievement_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_achievements_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_achievements_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_tournament_team_registration_status"
            referencedColumns: ["tournament_team_id"]
          },
          {
            foreignKeyName: "tournament_achievements_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_admins: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          role: Database["public"]["Enums"]["tournament_admin_role"]
          tournament_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["tournament_admin_role"]
          tournament_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["tournament_admin_role"]
          tournament_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_admins_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_name: string
          id: string
          new_data: Json | null
          old_data: Json | null
          tournament_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_name: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          tournament_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_name?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_audit_log_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_draw_audits: {
        Row: {
          algorithm_used: string
          created_by: string
          draw_metadata: Json
          drawn_at: string
          id: string
          tournament_id: string
        }
        Insert: {
          algorithm_used: string
          created_by: string
          draw_metadata?: Json
          drawn_at?: string
          id?: string
          tournament_id: string
        }
        Update: {
          algorithm_used?: string
          created_by?: string
          draw_metadata?: Json
          drawn_at?: string
          id?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_draw_audits_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_file_versions: {
        Row: {
          file_scope: string
          file_version: number
          id: string
          storage_path: string
          team_id: string | null
          tournament_id: string
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          file_scope: string
          file_version: number
          id?: string
          storage_path: string
          team_id?: string | null
          tournament_id: string
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          file_scope?: string
          file_version?: number
          id?: string
          storage_path?: string
          team_id?: string | null
          tournament_id?: string
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_file_versions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_file_versions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_tournament_team_registration_status"
            referencedColumns: ["tournament_team_id"]
          },
          {
            foreignKeyName: "tournament_file_versions_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_match_cards: {
        Row: {
          card_type: Database["public"]["Enums"]["card_type"]
          created_at: string
          id: string
          match_id: string
          player_user_id: string
          tournament_id: string
          tournament_match_result_id: string
        }
        Insert: {
          card_type: Database["public"]["Enums"]["card_type"]
          created_at?: string
          id?: string
          match_id: string
          player_user_id: string
          tournament_id: string
          tournament_match_result_id: string
        }
        Update: {
          card_type?: Database["public"]["Enums"]["card_type"]
          created_at?: string
          id?: string
          match_id?: string
          player_user_id?: string
          tournament_id?: string
          tournament_match_result_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_match_cards_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "tournament_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_match_cards_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_match_cards_tournament_match_result_id_fkey"
            columns: ["tournament_match_result_id"]
            isOneToOne: false
            referencedRelation: "tournament_match_results"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_match_goals: {
        Row: {
          assist_player_user_id: string | null
          created_at: string
          id: string
          match_id: string
          minute_mark: number | null
          player_user_id: string
          team_id: string
          tournament_id: string
          tournament_match_result_id: string
        }
        Insert: {
          assist_player_user_id?: string | null
          created_at?: string
          id?: string
          match_id: string
          minute_mark?: number | null
          player_user_id: string
          team_id: string
          tournament_id: string
          tournament_match_result_id: string
        }
        Update: {
          assist_player_user_id?: string | null
          created_at?: string
          id?: string
          match_id?: string
          minute_mark?: number | null
          player_user_id?: string
          team_id?: string
          tournament_id?: string
          tournament_match_result_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_match_goals_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "tournament_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_match_goals_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_match_goals_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_tournament_team_registration_status"
            referencedColumns: ["tournament_team_id"]
          },
          {
            foreignKeyName: "tournament_match_goals_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_match_goals_tournament_match_result_id_fkey"
            columns: ["tournament_match_result_id"]
            isOneToOne: false
            referencedRelation: "tournament_match_results"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_match_results: {
        Row: {
          away_score: number
          created_at: string
          home_score: number
          id: string
          mvp_user_id: string | null
          status: Database["public"]["Enums"]["match_result_status"]
          tournament_id: string
          tournament_match_id: string
          updated_at: string
          validated_at: string | null
          validated_by: string | null
        }
        Insert: {
          away_score?: number
          created_at?: string
          home_score?: number
          id?: string
          mvp_user_id?: string | null
          status?: Database["public"]["Enums"]["match_result_status"]
          tournament_id: string
          tournament_match_id: string
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Update: {
          away_score?: number
          created_at?: string
          home_score?: number
          id?: string
          mvp_user_id?: string | null
          status?: Database["public"]["Enums"]["match_result_status"]
          tournament_id?: string
          tournament_match_id?: string
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_match_results_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_match_results_tournament_match_id_fkey"
            columns: ["tournament_match_id"]
            isOneToOne: true
            referencedRelation: "tournament_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_matches: {
        Row: {
          away_team_id: string | null
          created_at: string
          draw_audit_id: string | null
          group_label: string | null
          home_team_id: string | null
          id: string
          is_walkover: boolean
          phase: string
          round_number: number | null
          scheduled_at: string | null
          status: Database["public"]["Enums"]["match_status"]
          tournament_id: string
          updated_at: string
          winner_team_id: string | null
        }
        Insert: {
          away_team_id?: string | null
          created_at?: string
          draw_audit_id?: string | null
          group_label?: string | null
          home_team_id?: string | null
          id?: string
          is_walkover?: boolean
          phase: string
          round_number?: number | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["match_status"]
          tournament_id: string
          updated_at?: string
          winner_team_id?: string | null
        }
        Update: {
          away_team_id?: string | null
          created_at?: string
          draw_audit_id?: string | null
          group_label?: string | null
          home_team_id?: string | null
          id?: string
          is_walkover?: boolean
          phase?: string
          round_number?: number | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["match_status"]
          tournament_id?: string
          updated_at?: string
          winner_team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "v_tournament_team_registration_status"
            referencedColumns: ["tournament_team_id"]
          },
          {
            foreignKeyName: "tournament_matches_draw_audit_id_fkey"
            columns: ["draw_audit_id"]
            isOneToOne: false
            referencedRelation: "tournament_draw_audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "v_tournament_team_registration_status"
            referencedColumns: ["tournament_team_id"]
          },
          {
            foreignKeyName: "tournament_matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "v_tournament_team_registration_status"
            referencedColumns: ["tournament_team_id"]
          },
        ]
      }
      tournament_player_stats: {
        Row: {
          assists: number
          avg_goals: number
          fair_play_points: number
          goals: number
          matches_played: number
          mvp_count: number
          player_user_id: string
          red_cards: number
          tournament_id: string
          updated_at: string
          yellow_cards: number
        }
        Insert: {
          assists?: number
          avg_goals?: number
          fair_play_points?: number
          goals?: number
          matches_played?: number
          mvp_count?: number
          player_user_id: string
          red_cards?: number
          tournament_id: string
          updated_at?: string
          yellow_cards?: number
        }
        Update: {
          assists?: number
          avg_goals?: number
          fair_play_points?: number
          goals?: number
          matches_played?: number
          mvp_count?: number
          player_user_id?: string
          red_cards?: number
          tournament_id?: string
          updated_at?: string
          yellow_cards?: number
        }
        Relationships: [
          {
            foreignKeyName: "tournament_player_stats_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_player_team_links: {
        Row: {
          created_at: string
          created_by: string
          ended_at: string | null
          id: string
          origin: Database["public"]["Enums"]["tournament_player_link_origin"]
          replaced_by_link_id: string | null
          status: Database["public"]["Enums"]["tournament_player_link_status"]
          tournament_id: string
          tournament_team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          ended_at?: string | null
          id?: string
          origin: Database["public"]["Enums"]["tournament_player_link_origin"]
          replaced_by_link_id?: string | null
          status?: Database["public"]["Enums"]["tournament_player_link_status"]
          tournament_id: string
          tournament_team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          ended_at?: string | null
          id?: string
          origin?: Database["public"]["Enums"]["tournament_player_link_origin"]
          replaced_by_link_id?: string | null
          status?: Database["public"]["Enums"]["tournament_player_link_status"]
          tournament_id?: string
          tournament_team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_player_team_links_replaced_by_link_id_fkey"
            columns: ["replaced_by_link_id"]
            isOneToOne: false
            referencedRelation: "tournament_player_team_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_player_team_links_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_player_team_links_tournament_team_id_fkey"
            columns: ["tournament_team_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_player_team_links_tournament_team_id_fkey"
            columns: ["tournament_team_id"]
            isOneToOne: false
            referencedRelation: "v_tournament_team_registration_status"
            referencedColumns: ["tournament_team_id"]
          },
        ]
      }
      tournament_team_players: {
        Row: {
          id: string
          invite_status: Database["public"]["Enums"]["player_invite_status"]
          invited_at: string
          invited_by: string
          responded_at: string | null
          tournament_id: string
          tournament_team_id: string
          user_id: string
        }
        Insert: {
          id?: string
          invite_status?: Database["public"]["Enums"]["player_invite_status"]
          invited_at?: string
          invited_by: string
          responded_at?: string | null
          tournament_id: string
          tournament_team_id: string
          user_id: string
        }
        Update: {
          id?: string
          invite_status?: Database["public"]["Enums"]["player_invite_status"]
          invited_at?: string
          invited_by?: string
          responded_at?: string | null
          tournament_id?: string
          tournament_team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_team_players_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_team_players_tournament_team_id_fkey"
            columns: ["tournament_team_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_team_players_tournament_team_id_fkey"
            columns: ["tournament_team_id"]
            isOneToOne: false
            referencedRelation: "v_tournament_team_registration_status"
            referencedColumns: ["tournament_team_id"]
          },
        ]
      }
      tournament_teams: {
        Row: {
          accepted_players_count: number
          created_at: string
          id: string
          image_url: string | null
          image_version: number
          is_locked: boolean
          min_players_required: number
          name: string
          owner_user_id: string
          registered_at: string | null
          status: string
          tournament_id: string
          updated_at: string
          withdrew_at: string | null
        }
        Insert: {
          accepted_players_count?: number
          created_at?: string
          id?: string
          image_url?: string | null
          image_version?: number
          is_locked?: boolean
          min_players_required?: number
          name: string
          owner_user_id: string
          registered_at?: string | null
          status?: string
          tournament_id: string
          updated_at?: string
          withdrew_at?: string | null
        }
        Update: {
          accepted_players_count?: number
          created_at?: string
          id?: string
          image_url?: string | null
          image_version?: number
          is_locked?: boolean
          min_players_required?: number
          name?: string
          owner_user_id?: string
          registered_at?: string | null
          status?: string
          tournament_id?: string
          updated_at?: string
          withdrew_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_teams_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_transfer_events: {
        Row: {
          created_at: string
          created_by: string
          from_team_id: string | null
          id: string
          reason: string | null
          source_type: Database["public"]["Enums"]["tournament_transfer_source"]
          to_team_id: string | null
          tournament_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          from_team_id?: string | null
          id?: string
          reason?: string | null
          source_type: Database["public"]["Enums"]["tournament_transfer_source"]
          to_team_id?: string | null
          tournament_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          from_team_id?: string | null
          id?: string
          reason?: string | null
          source_type?: Database["public"]["Enums"]["tournament_transfer_source"]
          to_team_id?: string | null
          tournament_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_transfer_events_from_team_id_fkey"
            columns: ["from_team_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_transfer_events_from_team_id_fkey"
            columns: ["from_team_id"]
            isOneToOne: false
            referencedRelation: "v_tournament_team_registration_status"
            referencedColumns: ["tournament_team_id"]
          },
          {
            foreignKeyName: "tournament_transfer_events_to_team_id_fkey"
            columns: ["to_team_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_transfer_events_to_team_id_fkey"
            columns: ["to_team_id"]
            isOneToOne: false
            referencedRelation: "v_tournament_team_registration_status"
            referencedColumns: ["tournament_team_id"]
          },
          {
            foreignKeyName: "tournament_transfer_events_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          allow_result_rollback_on_wo: boolean
          archived_at: string | null
          card_accumulation: boolean
          created_at: string
          created_by: string
          description: string | null
          finalized_at: string | null
          group_stage_groups_count: number | null
          has_team_limit: boolean
          id: string
          image_url: string | null
          image_version: number
          is_official: boolean
          keep_result_on_team_withdraw: boolean
          max_teams: number | null
          name: string
          registration_min_players: number
          round_trip: boolean
          status: Database["public"]["Enums"]["tournament_status"]
          tie_breaker_criteria: string[]
          tournament_type: Database["public"]["Enums"]["tournament_type"]
          transfer_window_closed_at: string | null
          transfer_window_ends_at: string | null
          transfer_window_starts_at: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allow_result_rollback_on_wo?: boolean
          archived_at?: string | null
          card_accumulation?: boolean
          created_at?: string
          created_by: string
          description?: string | null
          finalized_at?: string | null
          group_stage_groups_count?: number | null
          has_team_limit?: boolean
          id?: string
          image_url?: string | null
          image_version?: number
          is_official?: boolean
          keep_result_on_team_withdraw?: boolean
          max_teams?: number | null
          name: string
          registration_min_players?: number
          round_trip?: boolean
          status?: Database["public"]["Enums"]["tournament_status"]
          tie_breaker_criteria?: string[]
          tournament_type: Database["public"]["Enums"]["tournament_type"]
          transfer_window_closed_at?: string | null
          transfer_window_ends_at?: string | null
          transfer_window_starts_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allow_result_rollback_on_wo?: boolean
          archived_at?: string | null
          card_accumulation?: boolean
          created_at?: string
          created_by?: string
          description?: string | null
          finalized_at?: string | null
          group_stage_groups_count?: number | null
          has_team_limit?: boolean
          id?: string
          image_url?: string | null
          image_version?: number
          is_official?: boolean
          keep_result_on_team_withdraw?: boolean
          max_teams?: number | null
          name?: string
          registration_min_players?: number
          round_trip?: boolean
          status?: Database["public"]["Enums"]["tournament_status"]
          tie_breaker_criteria?: string[]
          tournament_type?: Database["public"]["Enums"]["tournament_type"]
          transfer_window_closed_at?: string | null
          transfer_window_ends_at?: string | null
          transfer_window_starts_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_tournament_rankings: {
        Row: {
          artillery_rank: number | null
          assists: number | null
          assists_rank: number | null
          avg_goals: number | null
          fair_play_points: number | null
          fair_play_rank: number | null
          goals: number | null
          matches_played: number | null
          player_user_id: string | null
          red_cards: number | null
          tournament_id: string | null
          yellow_cards: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_player_stats_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      v_tournament_team_registration_status: {
        Row: {
          accepted_players_count: number | null
          is_fully_registered: boolean | null
          is_locked: boolean | null
          min_players_required: number | null
          owner_user_id: string | null
          pending_invites: number | null
          rejected_invites: number | null
          status: string | null
          team_name: string | null
          tournament_id: string | null
          tournament_team_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_teams_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      v_user_global_tournament_stats: {
        Row: {
          avg_goals_per_tournament: number | null
          player_user_id: string | null
          total_assists: number | null
          total_goals: number | null
          total_matches: number | null
          total_red_cards: number | null
          total_yellow_cards: number | null
          tournaments_played: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_manage_tournament_storage: {
        Args: { p_object_name: string }
        Returns: boolean
      }
      ensure_tournament_not_read_only: {
        Args: { p_tournament_id: string }
        Returns: undefined
      }
      is_automatic_admin: { Args: { p_user_id: string }; Returns: boolean }
      is_automatic_member: { Args: { p_user_id: string }; Returns: boolean }
      is_goalkeeper_guest_name: {
        Args: { p_guest_name: string }
        Returns: boolean
      }
      is_pelada_admin: {
        Args: { p_pelada_id: string; p_user_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: { p_user_id: string }; Returns: boolean }
      is_tournament_admin: {
        Args: { p_tournament_id: string; p_user_id: string }
        Returns: boolean
      }
      is_tournament_system_admin: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      is_tournament_team_owner: {
        Args: { p_team_id: string; p_user_id: string }
        Returns: boolean
      }
      is_transfer_window_open: {
        Args: { p_tournament_id: string }
        Returns: boolean
      }
      is_user_banned_for_pelada: {
        Args: { p_pelada_id: string; p_user_id: string }
        Returns: boolean
      }
      rebalance_pelada_waitlist: {
        Args: { p_pelada_id: string }
        Returns: undefined
      }
      rebuild_tournament_player_stats: {
        Args: { p_tournament_id: string }
        Returns: undefined
      }
      write_tournament_audit_log: {
        Args: {
          p_action: string
          p_entity_id: string
          p_entity_name: string
          p_new_data: Json
          p_old_data: Json
          p_tournament_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      achievement_type:
        | "CAMPEAO"
        | "VICE_CAMPEAO"
        | "ARTILHEIRO"
        | "GARCOM"
        | "MELHOR_DEFESA"
        | "FAIR_PLAY"
        | "PARTICIPACAO"
      card_type: "AMARELO" | "VERMELHO"
      match_result_status: "RASCUNHO" | "VALIDADO"
      match_status: "AGENDADO" | "EM_ANDAMENTO" | "FINALIZADO" | "WO"
      player_invite_status: "PENDENTE" | "ACEITO" | "RECUSADO"
      tournament_admin_role: "ADMIN_SISTEMA" | "ADMIN_TORNEIO" | "DONO_TIME"
      tournament_player_link_origin:
        | "LIVRE"
        | "TRANSFERENCIA_INTERNA"
        | "HISTORICO_TORNEIO_ANTERIOR"
      tournament_player_link_status: "ATIVO" | "REMOVIDO" | "SUBSTITUIDO"
      tournament_status:
        | "DRAFT"
        | "INSCRICOES_ABERTAS"
        | "INSCRICOES_ENCERRADAS"
        | "TABELA_GERADA"
        | "EM_ANDAMENTO"
        | "FINALIZADO"
        | "ARQUIVADO"
      tournament_transfer_source: "LIVRE" | "TRANSFERENCIA"
      tournament_type: "LIGA" | "MATA_MATA" | "GRUPOS_COM_MATA_MATA"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      achievement_type: [
        "CAMPEAO",
        "VICE_CAMPEAO",
        "ARTILHEIRO",
        "GARCOM",
        "MELHOR_DEFESA",
        "FAIR_PLAY",
        "PARTICIPACAO",
      ],
      card_type: ["AMARELO", "VERMELHO"],
      match_result_status: ["RASCUNHO", "VALIDADO"],
      match_status: ["AGENDADO", "EM_ANDAMENTO", "FINALIZADO", "WO"],
      player_invite_status: ["PENDENTE", "ACEITO", "RECUSADO"],
      tournament_admin_role: ["ADMIN_SISTEMA", "ADMIN_TORNEIO", "DONO_TIME"],
      tournament_player_link_origin: [
        "LIVRE",
        "TRANSFERENCIA_INTERNA",
        "HISTORICO_TORNEIO_ANTERIOR",
      ],
      tournament_player_link_status: ["ATIVO", "REMOVIDO", "SUBSTITUIDO"],
      tournament_status: [
        "DRAFT",
        "INSCRICOES_ABERTAS",
        "INSCRICOES_ENCERRADAS",
        "TABELA_GERADA",
        "EM_ANDAMENTO",
        "FINALIZADO",
        "ARQUIVADO",
      ],
      tournament_transfer_source: ["LIVRE", "TRANSFERENCIA"],
      tournament_type: ["LIGA", "MATA_MATA", "GRUPOS_COM_MATA_MATA"],
    },
  },
} as const
