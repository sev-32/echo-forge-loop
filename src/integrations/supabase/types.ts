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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      context_bank_entries: {
        Row: {
          bank_id: string
          content: string
          created_at: string
          id: string
          metadata: Json
          priority: number
          source: string
          tokens_estimate: number
        }
        Insert: {
          bank_id: string
          content: string
          created_at?: string
          id?: string
          metadata?: Json
          priority?: number
          source?: string
          tokens_estimate?: number
        }
        Update: {
          bank_id?: string
          content?: string
          created_at?: string
          id?: string
          metadata?: Json
          priority?: number
          source?: string
          tokens_estimate?: number
        }
        Relationships: [
          {
            foreignKeyName: "context_bank_entries_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "context_banks"
            referencedColumns: ["id"]
          },
        ]
      }
      context_banks: {
        Row: {
          auto_prune: boolean
          created_at: string
          description: string
          id: string
          max_tokens: number
          metadata: Json
          name: string
          updated_at: string
        }
        Insert: {
          auto_prune?: boolean
          created_at?: string
          description?: string
          id?: string
          max_tokens?: number
          metadata?: Json
          name: string
          updated_at?: string
        }
        Update: {
          auto_prune?: boolean
          created_at?: string
          description?: string
          id?: string
          max_tokens?: number
          metadata?: Json
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          created_at: string
          event_type: string
          hash_prev: string | null
          hash_self: string | null
          id: string
          payload: Json
          run_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          hash_prev?: string | null
          hash_self?: string | null
          id?: string
          payload?: Json
          run_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          hash_prev?: string | null
          hash_self?: string | null
          id?: string
          payload?: Json
          run_id?: string
        }
        Relationships: []
      }
      journal_entries: {
        Row: {
          content: string
          created_at: string
          entry_type: string
          id: string
          metadata: Json
          parent_id: string | null
          priority: string
          run_id: string | null
          tags: string[]
          task_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          entry_type: string
          id?: string
          metadata?: Json
          parent_id?: string | null
          priority?: string
          run_id?: string | null
          tags?: string[]
          task_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          entry_type?: string
          id?: string
          metadata?: Json
          parent_id?: string | null
          priority?: string
          run_id?: string | null
          tags?: string[]
          task_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_edges: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          relation: string
          source_id: string
          target_id: string
          weight: number
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json
          relation?: string
          source_id: string
          target_id: string
          weight?: number
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          relation?: string
          source_id?: string
          target_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_edges_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "knowledge_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_edges_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "knowledge_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_nodes: {
        Row: {
          created_at: string
          id: string
          label: string
          metadata: Json
          node_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          metadata?: Json
          node_type?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          metadata?: Json
          node_type?: string
        }
        Relationships: []
      }
      process_rules: {
        Row: {
          active: boolean
          category: string
          confidence: number
          created_at: string
          id: string
          rule_text: string
          source_run_id: string | null
          times_applied: number
          times_helped: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string
          confidence?: number
          created_at?: string
          id?: string
          rule_text: string
          source_run_id?: string | null
          times_applied?: number
          times_helped?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          confidence?: number
          created_at?: string
          id?: string
          rule_text?: string
          source_run_id?: string | null
          times_applied?: number
          times_helped?: number
          updated_at?: string
        }
        Relationships: []
      }
      snapshots: {
        Row: {
          created_at: string
          event_count: number
          id: string
          reason: string
          run_id: string
          state: Json
        }
        Insert: {
          created_at?: string
          event_count?: number
          id?: string
          reason?: string
          run_id: string
          state?: Json
        }
        Update: {
          created_at?: string
          event_count?: number
          id?: string
          reason?: string
          run_id?: string
          state?: Json
        }
        Relationships: []
      }
      tasks: {
        Row: {
          acceptance_criteria: Json
          context_refs: string[]
          created_at: string
          dependencies: string[]
          error: string | null
          history: Json
          id: string
          priority: number
          prompt: string
          result: Json | null
          run_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          acceptance_criteria?: Json
          context_refs?: string[]
          created_at?: string
          dependencies?: string[]
          error?: string | null
          history?: Json
          id?: string
          priority?: number
          prompt?: string
          result?: Json | null
          run_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          acceptance_criteria?: Json
          context_refs?: string[]
          created_at?: string
          dependencies?: string[]
          error?: string | null
          history?: Json
          id?: string
          priority?: number
          prompt?: string
          result?: Json | null
          run_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      test_runs: {
        Row: {
          budget_snapshot: Json
          comparison: Json | null
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          errors: string[]
          events_snapshot: Json
          id: string
          max_score: number | null
          notes: Json
          score: number | null
          score_breakdown: Json
          spec_snapshot: Json
          status: string
          suite_id: string | null
          test_id: string
        }
        Insert: {
          budget_snapshot?: Json
          comparison?: Json | null
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          errors?: string[]
          events_snapshot?: Json
          id?: string
          max_score?: number | null
          notes?: Json
          score?: number | null
          score_breakdown?: Json
          spec_snapshot?: Json
          status?: string
          suite_id?: string | null
          test_id: string
        }
        Update: {
          budget_snapshot?: Json
          comparison?: Json | null
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          errors?: string[]
          events_snapshot?: Json
          id?: string
          max_score?: number | null
          notes?: Json
          score?: number | null
          score_breakdown?: Json
          spec_snapshot?: Json
          status?: string
          suite_id?: string | null
          test_id?: string
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
      [_ in never]: never
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
    Enums: {},
  },
} as const
