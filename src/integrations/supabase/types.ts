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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      broadcasts: {
        Row: {
          color: string
          created_at: string
          expires_at: string | null
          id: string
          message: string
          sent_by: string | null
          target_teams: Json
        }
        Insert: {
          color?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          message: string
          sent_by?: string | null
          target_teams?: Json
        }
        Update: {
          color?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          message?: string
          sent_by?: string | null
          target_teams?: Json
        }
        Relationships: []
      }
      children: {
        Row: {
          created_at: string
          full_name: string
          has_logged_in: boolean
          id: string
          iron_dollars: number
          is_present: boolean
          note_from_table: string | null
          phone: string | null
          raw_data: Json | null
          row_number: number | null
          shift_id: string | null
          supervisor_notes: string | null
          team_name: string | null
          team_number: number
          telegram_username: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name: string
          has_logged_in?: boolean
          id?: string
          iron_dollars?: number
          is_present?: boolean
          note_from_table?: string | null
          phone?: string | null
          raw_data?: Json | null
          row_number?: number | null
          shift_id?: string | null
          supervisor_notes?: string | null
          team_name?: string | null
          team_number: number
          telegram_username?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          has_logged_in?: boolean
          id?: string
          iron_dollars?: number
          is_present?: boolean
          note_from_table?: string | null
          phone?: string | null
          raw_data?: Json | null
          row_number?: number | null
          shift_id?: string | null
          supervisor_notes?: string | null
          team_name?: string | null
          team_number?: number
          telegram_username?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "children_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      iron_dollar_transactions: {
        Row: {
          amount_change: number
          balance_after: number | null
          child_id: string
          created_at: string
          id: string
          performed_by: string | null
          reason: string | null
          supervisor_user_id: string | null
        }
        Insert: {
          amount_change: number
          balance_after?: number | null
          child_id: string
          created_at?: string
          id?: string
          performed_by?: string | null
          reason?: string | null
          supervisor_user_id?: string | null
        }
        Update: {
          amount_change?: number
          balance_after?: number | null
          child_id?: string
          created_at?: string
          id?: string
          performed_by?: string | null
          reason?: string | null
          supervisor_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "iron_dollar_transactions_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          metadata: Json | null
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          metadata?: Json | null
          title: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          metadata?: Json | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      schedule_items: {
        Row: {
          created_at: string
          description: string | null
          id: string
          order_index: number
          schedule_id: string
          target_teams: Json
          time_end: string | null
          time_start: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          order_index?: number
          schedule_id: string
          target_teams?: Json
          time_end?: string | null
          time_start?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          order_index?: number
          schedule_id?: string
          target_teams?: Json
          time_end?: string | null
          time_start?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_items_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          created_at: string
          date: string
          id: string
          is_published: boolean
          raw_text: string | null
          shift_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          is_published?: boolean
          raw_text?: string | null
          shift_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          is_published?: boolean
          raw_text?: string | null
          shift_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedules_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          created_at: string
          deleted_at: string | null
          end_date: string
          id: string
          is_active: boolean
          name: string
          shift_type: string
          start_date: string
          team_offset: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          end_date: string
          id?: string
          is_active?: boolean
          name: string
          shift_type: string
          start_date: string
          team_offset?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          end_date?: string
          id?: string
          is_active?: boolean
          name?: string
          shift_type?: string
          start_date?: string
          team_offset?: number
          updated_at?: string
        }
        Relationships: []
      }
      talent_entries: {
        Row: {
          break_needed_after: number
          created_at: string
          created_by: string | null
          description: string | null
          event_id: string
          id: string
          order_index: number
          team_number: number
          title: string
          updated_at: string
        }
        Insert: {
          break_needed_after?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_id: string
          id?: string
          order_index?: number
          team_number: number
          title: string
          updated_at?: string
        }
        Update: {
          break_needed_after?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_id?: string
          id?: string
          order_index?: number
          team_number?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_entries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "talent_events"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_events: {
        Row: {
          created_at: string
          id: string
          shift_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          shift_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          shift_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_events_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      transfers: {
        Row: {
          child_full_name: string
          child_id: string
          created_at: string
          from_team: number
          id: string
          performed_by: string | null
          to_team: number
        }
        Insert: {
          child_full_name: string
          child_id: string
          created_at?: string
          from_team: number
          id?: string
          performed_by?: string | null
          to_team: number
        }
        Update: {
          child_full_name?: string
          child_id?: string
          created_at?: string
          from_team?: number
          id?: string
          performed_by?: string | null
          to_team?: number
        }
        Relationships: [
          {
            foreignKeyName: "transfers_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      uploaded_files: {
        Row: {
          created_at: string
          filename: string
          id: string
          rows_count: number
          shift_id: string | null
        }
        Insert: {
          created_at?: string
          filename: string
          id?: string
          rows_count?: number
          shift_id?: string | null
        }
        Update: {
          created_at?: string
          filename?: string
          id?: string
          rows_count?: number
          shift_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "uploaded_files_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          child_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          team_number: number | null
          user_id: string
        }
        Insert: {
          child_id?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          team_number?: number | null
          user_id: string
        }
        Update: {
          child_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          team_number?: number | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      app_role: "admin" | "supervisor" | "child"
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
      app_role: ["admin", "supervisor", "child"],
    },
  },
} as const
