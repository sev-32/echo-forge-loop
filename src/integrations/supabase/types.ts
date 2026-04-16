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
      atoms: {
        Row: {
          atom_type: Database["public"]["Enums"]["atom_type"]
          content: string
          content_hash: string
          created_at: string
          id: string
          metadata: Json
          provenance: Json
          run_id: string | null
          superseded_by: string | null
          task_id: string | null
          tokens_estimate: number
          transaction_time: string
          valid_time_end: string | null
          valid_time_start: string
        }
        Insert: {
          atom_type?: Database["public"]["Enums"]["atom_type"]
          content: string
          content_hash: string
          created_at?: string
          id?: string
          metadata?: Json
          provenance?: Json
          run_id?: string | null
          superseded_by?: string | null
          task_id?: string | null
          tokens_estimate?: number
          transaction_time?: string
          valid_time_end?: string | null
          valid_time_start?: string
        }
        Update: {
          atom_type?: Database["public"]["Enums"]["atom_type"]
          content?: string
          content_hash?: string
          created_at?: string
          id?: string
          metadata?: Json
          provenance?: Json
          run_id?: string | null
          superseded_by?: string | null
          task_id?: string | null
          tokens_estimate?: number
          transaction_time?: string
          valid_time_end?: string | null
          valid_time_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "atoms_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "atoms"
            referencedColumns: ["id"]
          },
        ]
      }
      cognitive_snapshots: {
        Row: {
          active_concepts: string[]
          attention_breadth: Database["public"]["Enums"]["attention_breadth"]
          cognitive_load: number
          cold_concepts: string[]
          concept_churn_rate: number
          created_at: string
          drift_details: string | null
          drift_detected: boolean
          drift_score: number
          failure_confidence: number | null
          failure_details: string | null
          failure_mode: Database["public"]["Enums"]["failure_mode"] | null
          id: string
          metadata: Json
          plan_step_id: string | null
          reasoning_depth: number
          run_id: string
          self_consistency_score: number
          task_id: string | null
          uncertainty_awareness: number
          witness_id: string | null
        }
        Insert: {
          active_concepts?: string[]
          attention_breadth?: Database["public"]["Enums"]["attention_breadth"]
          cognitive_load?: number
          cold_concepts?: string[]
          concept_churn_rate?: number
          created_at?: string
          drift_details?: string | null
          drift_detected?: boolean
          drift_score?: number
          failure_confidence?: number | null
          failure_details?: string | null
          failure_mode?: Database["public"]["Enums"]["failure_mode"] | null
          id?: string
          metadata?: Json
          plan_step_id?: string | null
          reasoning_depth?: number
          run_id: string
          self_consistency_score?: number
          task_id?: string | null
          uncertainty_awareness?: number
          witness_id?: string | null
        }
        Update: {
          active_concepts?: string[]
          attention_breadth?: Database["public"]["Enums"]["attention_breadth"]
          cognitive_load?: number
          cold_concepts?: string[]
          concept_churn_rate?: number
          created_at?: string
          drift_details?: string | null
          drift_detected?: boolean
          drift_score?: number
          failure_confidence?: number | null
          failure_details?: string | null
          failure_mode?: Database["public"]["Enums"]["failure_mode"] | null
          id?: string
          metadata?: Json
          plan_step_id?: string | null
          reasoning_depth?: number
          run_id?: string
          self_consistency_score?: number
          task_id?: string | null
          uncertainty_awareness?: number
          witness_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cognitive_snapshots_plan_step_id_fkey"
            columns: ["plan_step_id"]
            isOneToOne: false
            referencedRelation: "plan_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cognitive_snapshots_witness_id_fkey"
            columns: ["witness_id"]
            isOneToOne: false
            referencedRelation: "witness_envelopes"
            referencedColumns: ["id"]
          },
        ]
      }
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
      contradictions: {
        Row: {
          created_at: string
          detection_method: string
          id: string
          metadata: Json
          node_a_id: string
          node_b_id: string
          resolution: string | null
          resolution_reasoning: string | null
          resolved_at: string | null
          resolved_by_run_id: string | null
          run_id: string | null
          similarity_score: number
          stance: string
          witness_id: string | null
        }
        Insert: {
          created_at?: string
          detection_method?: string
          id?: string
          metadata?: Json
          node_a_id: string
          node_b_id: string
          resolution?: string | null
          resolution_reasoning?: string | null
          resolved_at?: string | null
          resolved_by_run_id?: string | null
          run_id?: string | null
          similarity_score?: number
          stance?: string
          witness_id?: string | null
        }
        Update: {
          created_at?: string
          detection_method?: string
          id?: string
          metadata?: Json
          node_a_id?: string
          node_b_id?: string
          resolution?: string | null
          resolution_reasoning?: string | null
          resolved_at?: string | null
          resolved_by_run_id?: string | null
          run_id?: string | null
          similarity_score?: number
          stance?: string
          witness_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contradictions_node_a_id_fkey"
            columns: ["node_a_id"]
            isOneToOne: false
            referencedRelation: "knowledge_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contradictions_node_b_id_fkey"
            columns: ["node_b_id"]
            isOneToOne: false
            referencedRelation: "knowledge_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contradictions_witness_id_fkey"
            columns: ["witness_id"]
            isOneToOne: false
            referencedRelation: "witness_envelopes"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          last_run_id: string | null
          messages: Json
          title: string
          total_tokens: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_run_id?: string | null
          messages?: Json
          title?: string
          total_tokens?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_run_id?: string | null
          messages?: Json
          title?: string
          total_tokens?: number
          updated_at?: string
        }
        Relationships: []
      }
      dora_metrics: {
        Row: {
          change_failure_rate: number
          created_at: string
          deployment_frequency: number
          id: string
          lead_time_seconds: number
          metadata: Json
          restore_time_seconds: number
          run_id: string
          tier: string
        }
        Insert: {
          change_failure_rate?: number
          created_at?: string
          deployment_frequency?: number
          id?: string
          lead_time_seconds?: number
          metadata?: Json
          restore_time_seconds?: number
          run_id: string
          tier?: string
        }
        Update: {
          change_failure_rate?: number
          created_at?: string
          deployment_frequency?: number
          id?: string
          lead_time_seconds?: number
          metadata?: Json
          restore_time_seconds?: number
          run_id?: string
          tier?: string
        }
        Relationships: []
      }
      ece_tracking: {
        Row: {
          actual_accuracy: number | null
          bin: number
          created_at: string
          id: string
          model_id: string
          operation_type: Database["public"]["Enums"]["vif_operation_type"]
          predicted_confidence: number
          run_id: string
          witness_id: string | null
        }
        Insert: {
          actual_accuracy?: number | null
          bin?: number
          created_at?: string
          id?: string
          model_id?: string
          operation_type: Database["public"]["Enums"]["vif_operation_type"]
          predicted_confidence: number
          run_id: string
          witness_id?: string | null
        }
        Update: {
          actual_accuracy?: number | null
          bin?: number
          created_at?: string
          id?: string
          model_id?: string
          operation_type?: Database["public"]["Enums"]["vif_operation_type"]
          predicted_confidence?: number
          run_id?: string
          witness_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ece_tracking_witness_id_fkey"
            columns: ["witness_id"]
            isOneToOne: false
            referencedRelation: "witness_envelopes"
            referencedColumns: ["id"]
          },
        ]
      }
      ensemble_analyses: {
        Row: {
          archivist_context: string
          confidence_score: number
          created_at: string
          critic_findings: Json
          id: string
          researcher_grounding: string
          run_id: string
          synthesizer_draft: string
          witness_id: string | null
        }
        Insert: {
          archivist_context: string
          confidence_score?: number
          created_at?: string
          critic_findings?: Json
          id?: string
          researcher_grounding: string
          run_id: string
          synthesizer_draft: string
          witness_id?: string | null
        }
        Update: {
          archivist_context?: string
          confidence_score?: number
          created_at?: string
          critic_findings?: Json
          id?: string
          researcher_grounding?: string
          run_id?: string
          synthesizer_draft?: string
          witness_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ensemble_analyses_witness_id_fkey"
            columns: ["witness_id"]
            isOneToOne: false
            referencedRelation: "witness_envelopes"
            referencedColumns: ["id"]
          },
        ]
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
      execution_plans: {
        Row: {
          budget_config: Json
          budget_used: Json
          completed_at: string | null
          completed_steps: number
          complexity: string
          created_at: string
          failed_steps: number
          gates_config: Json
          goal: string
          id: string
          metadata: Json
          plan_acl: Json
          reasoning: string
          run_id: string
          status: Database["public"]["Enums"]["plan_status"]
          total_steps: number
        }
        Insert: {
          budget_config?: Json
          budget_used?: Json
          completed_at?: string | null
          completed_steps?: number
          complexity?: string
          created_at?: string
          failed_steps?: number
          gates_config?: Json
          goal?: string
          id?: string
          metadata?: Json
          plan_acl?: Json
          reasoning?: string
          run_id: string
          status?: Database["public"]["Enums"]["plan_status"]
          total_steps?: number
        }
        Update: {
          budget_config?: Json
          budget_used?: Json
          completed_at?: string | null
          completed_steps?: number
          complexity?: string
          created_at?: string
          failed_steps?: number
          gates_config?: Json
          goal?: string
          id?: string
          metadata?: Json
          plan_acl?: Json
          reasoning?: string
          run_id?: string
          status?: Database["public"]["Enums"]["plan_status"]
          total_steps?: number
        }
        Relationships: []
      }
      ion_artifacts: {
        Row: {
          artifact_type: string
          authority_class: Database["public"]["Enums"]["ion_authority_class"]
          content: string
          content_hash: string
          created_at: string
          created_by_work_unit_id: string | null
          id: string
          metadata: Json
          name: string
          run_id: string
          superseded_by: string | null
          tokens_estimate: number
          version: number
        }
        Insert: {
          artifact_type?: string
          authority_class?: Database["public"]["Enums"]["ion_authority_class"]
          content?: string
          content_hash?: string
          created_at?: string
          created_by_work_unit_id?: string | null
          id?: string
          metadata?: Json
          name: string
          run_id: string
          superseded_by?: string | null
          tokens_estimate?: number
          version?: number
        }
        Update: {
          artifact_type?: string
          authority_class?: Database["public"]["Enums"]["ion_authority_class"]
          content?: string
          content_hash?: string
          created_at?: string
          created_by_work_unit_id?: string | null
          id?: string
          metadata?: Json
          name?: string
          run_id?: string
          superseded_by?: string | null
          tokens_estimate?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ion_artifacts_created_by_work_unit_id_fkey"
            columns: ["created_by_work_unit_id"]
            isOneToOne: false
            referencedRelation: "ion_work_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ion_artifacts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ion_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ion_artifacts_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "ion_artifacts"
            referencedColumns: ["id"]
          },
        ]
      }
      ion_commit_deltas: {
        Row: {
          artifacts_created: Json
          child_work_suggested: Json
          confidence: number
          contradictions_found: Json
          created_at: string
          id: string
          ledger_rows: Json
          metadata: Json
          protocol: string | null
          questions_raised: Json
          review_notes: string | null
          review_reasons: Json
          reviewed_at: string | null
          reviewed_by: string | null
          run_id: string
          signals_emitted: Json
          status: Database["public"]["Enums"]["ion_delta_status"]
          work_unit_id: string
        }
        Insert: {
          artifacts_created?: Json
          child_work_suggested?: Json
          confidence?: number
          contradictions_found?: Json
          created_at?: string
          id?: string
          ledger_rows?: Json
          metadata?: Json
          protocol?: string | null
          questions_raised?: Json
          review_notes?: string | null
          review_reasons?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          run_id: string
          signals_emitted?: Json
          status?: Database["public"]["Enums"]["ion_delta_status"]
          work_unit_id: string
        }
        Update: {
          artifacts_created?: Json
          child_work_suggested?: Json
          confidence?: number
          contradictions_found?: Json
          created_at?: string
          id?: string
          ledger_rows?: Json
          metadata?: Json
          protocol?: string | null
          questions_raised?: Json
          review_notes?: string | null
          review_reasons?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          run_id?: string
          signals_emitted?: Json
          status?: Database["public"]["Enums"]["ion_delta_status"]
          work_unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ion_commit_deltas_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ion_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ion_commit_deltas_work_unit_id_fkey"
            columns: ["work_unit_id"]
            isOneToOne: false
            referencedRelation: "ion_work_units"
            referencedColumns: ["id"]
          },
        ]
      }
      ion_context_packages: {
        Row: {
          allowed_actions: Json
          artifact_refs: Json
          content: string
          content_hash: string
          created_at: string
          doctrine_refs: Json
          id: string
          open_question_refs: Json
          run_id: string
          tokens_estimate: number
          version: number
        }
        Insert: {
          allowed_actions?: Json
          artifact_refs?: Json
          content?: string
          content_hash?: string
          created_at?: string
          doctrine_refs?: Json
          id?: string
          open_question_refs?: Json
          run_id: string
          tokens_estimate?: number
          version?: number
        }
        Update: {
          allowed_actions?: Json
          artifact_refs?: Json
          content?: string
          content_hash?: string
          created_at?: string
          doctrine_refs?: Json
          id?: string
          open_question_refs?: Json
          run_id?: string
          tokens_estimate?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ion_context_packages_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ion_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      ion_open_questions: {
        Row: {
          answer: string | null
          answered_at: string | null
          answered_by_work_unit_id: string | null
          context: string
          created_at: string
          id: string
          metadata: Json
          priority: number
          question: string
          routed_to_work_unit_id: string | null
          run_id: string
          source_work_unit_id: string | null
          status: Database["public"]["Enums"]["ion_question_status"]
        }
        Insert: {
          answer?: string | null
          answered_at?: string | null
          answered_by_work_unit_id?: string | null
          context?: string
          created_at?: string
          id?: string
          metadata?: Json
          priority?: number
          question: string
          routed_to_work_unit_id?: string | null
          run_id: string
          source_work_unit_id?: string | null
          status?: Database["public"]["Enums"]["ion_question_status"]
        }
        Update: {
          answer?: string | null
          answered_at?: string | null
          answered_by_work_unit_id?: string | null
          context?: string
          created_at?: string
          id?: string
          metadata?: Json
          priority?: number
          question?: string
          routed_to_work_unit_id?: string | null
          run_id?: string
          source_work_unit_id?: string | null
          status?: Database["public"]["Enums"]["ion_question_status"]
        }
        Relationships: [
          {
            foreignKeyName: "ion_open_questions_answered_by_work_unit_id_fkey"
            columns: ["answered_by_work_unit_id"]
            isOneToOne: false
            referencedRelation: "ion_work_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ion_open_questions_routed_to_work_unit_id_fkey"
            columns: ["routed_to_work_unit_id"]
            isOneToOne: false
            referencedRelation: "ion_work_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ion_open_questions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ion_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ion_open_questions_source_work_unit_id_fkey"
            columns: ["source_work_unit_id"]
            isOneToOne: false
            referencedRelation: "ion_work_units"
            referencedColumns: ["id"]
          },
        ]
      }
      ion_runs: {
        Row: {
          autonomy_mode: string
          completed_work_units: number
          config: Json
          created_at: string
          goal: string
          id: string
          metadata: Json
          priority_tier: number
          state_snapshot: Json
          status: Database["public"]["Enums"]["ion_run_status"]
          stopped_at: string | null
          total_tokens: number
          total_work_units: number
          updated_at: string
        }
        Insert: {
          autonomy_mode?: string
          completed_work_units?: number
          config?: Json
          created_at?: string
          goal?: string
          id?: string
          metadata?: Json
          priority_tier?: number
          state_snapshot?: Json
          status?: Database["public"]["Enums"]["ion_run_status"]
          stopped_at?: string | null
          total_tokens?: number
          total_work_units?: number
          updated_at?: string
        }
        Update: {
          autonomy_mode?: string
          completed_work_units?: number
          config?: Json
          created_at?: string
          goal?: string
          id?: string
          metadata?: Json
          priority_tier?: number
          state_snapshot?: Json
          status?: Database["public"]["Enums"]["ion_run_status"]
          stopped_at?: string | null
          total_tokens?: number
          total_work_units?: number
          updated_at?: string
        }
        Relationships: []
      }
      ion_signals: {
        Row: {
          consumed: boolean
          consumed_by_work_unit_id: string | null
          created_at: string
          id: string
          payload: Json
          run_id: string
          signal_type: string
          source_work_unit_id: string | null
          target_protocol: Database["public"]["Enums"]["ion_protocol"] | null
        }
        Insert: {
          consumed?: boolean
          consumed_by_work_unit_id?: string | null
          created_at?: string
          id?: string
          payload?: Json
          run_id: string
          signal_type: string
          source_work_unit_id?: string | null
          target_protocol?: Database["public"]["Enums"]["ion_protocol"] | null
        }
        Update: {
          consumed?: boolean
          consumed_by_work_unit_id?: string | null
          created_at?: string
          id?: string
          payload?: Json
          run_id?: string
          signal_type?: string
          source_work_unit_id?: string | null
          target_protocol?: Database["public"]["Enums"]["ion_protocol"] | null
        }
        Relationships: [
          {
            foreignKeyName: "ion_signals_consumed_by_work_unit_id_fkey"
            columns: ["consumed_by_work_unit_id"]
            isOneToOne: false
            referencedRelation: "ion_work_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ion_signals_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ion_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ion_signals_source_work_unit_id_fkey"
            columns: ["source_work_unit_id"]
            isOneToOne: false
            referencedRelation: "ion_work_units"
            referencedColumns: ["id"]
          },
        ]
      }
      ion_work_units: {
        Row: {
          allowed_writes: Json
          assigned_at: string | null
          completed_at: string | null
          context_package_id: string | null
          context_version: number | null
          created_at: string
          dependencies: string[]
          description: string
          error: string | null
          id: string
          input_data: Json
          metadata: Json
          output_contract: Json
          priority: number
          protocol: Database["public"]["Enums"]["ion_protocol"]
          result_data: Json | null
          run_id: string
          shard_index: number
          status: Database["public"]["Enums"]["ion_work_unit_status"]
          title: string
          tokens_used: number
        }
        Insert: {
          allowed_writes?: Json
          assigned_at?: string | null
          completed_at?: string | null
          context_package_id?: string | null
          context_version?: number | null
          created_at?: string
          dependencies?: string[]
          description?: string
          error?: string | null
          id?: string
          input_data?: Json
          metadata?: Json
          output_contract?: Json
          priority?: number
          protocol: Database["public"]["Enums"]["ion_protocol"]
          result_data?: Json | null
          run_id: string
          shard_index?: number
          status?: Database["public"]["Enums"]["ion_work_unit_status"]
          title?: string
          tokens_used?: number
        }
        Update: {
          allowed_writes?: Json
          assigned_at?: string | null
          completed_at?: string | null
          context_package_id?: string | null
          context_version?: number | null
          created_at?: string
          dependencies?: string[]
          description?: string
          error?: string | null
          id?: string
          input_data?: Json
          metadata?: Json
          output_contract?: Json
          priority?: number
          protocol?: Database["public"]["Enums"]["ion_protocol"]
          result_data?: Json | null
          run_id?: string
          shard_index?: number
          status?: Database["public"]["Enums"]["ion_work_unit_status"]
          title?: string
          tokens_used?: number
        }
        Relationships: [
          {
            foreignKeyName: "ion_work_units_context_package_id_fkey"
            columns: ["context_package_id"]
            isOneToOne: false
            referencedRelation: "ion_context_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ion_work_units_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ion_runs"
            referencedColumns: ["id"]
          },
        ]
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
          edge_type: string
          id: string
          metadata: Json
          relation: string
          run_id: string | null
          source_id: string
          strength: number
          target_id: string
          weight: number
          witness_id: string | null
        }
        Insert: {
          created_at?: string
          edge_type?: string
          id?: string
          metadata?: Json
          relation?: string
          run_id?: string | null
          source_id: string
          strength?: number
          target_id: string
          weight?: number
          witness_id?: string | null
        }
        Update: {
          created_at?: string
          edge_type?: string
          id?: string
          metadata?: Json
          relation?: string
          run_id?: string | null
          source_id?: string
          strength?: number
          target_id?: string
          weight?: number
          witness_id?: string | null
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
          {
            foreignKeyName: "knowledge_edges_witness_id_fkey"
            columns: ["witness_id"]
            isOneToOne: false
            referencedRelation: "witness_envelopes"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_nodes: {
        Row: {
          atom_id: string | null
          confidence: number
          created_at: string
          evidence_type: string
          id: string
          label: string
          metadata: Json
          node_type: string
          run_id: string | null
          valid_time_end: string | null
          valid_time_start: string | null
          witness_id: string | null
        }
        Insert: {
          atom_id?: string | null
          confidence?: number
          created_at?: string
          evidence_type?: string
          id?: string
          label: string
          metadata?: Json
          node_type?: string
          run_id?: string | null
          valid_time_end?: string | null
          valid_time_start?: string | null
          witness_id?: string | null
        }
        Update: {
          atom_id?: string | null
          confidence?: number
          created_at?: string
          evidence_type?: string
          id?: string
          label?: string
          metadata?: Json
          node_type?: string
          run_id?: string | null
          valid_time_end?: string | null
          valid_time_start?: string | null
          witness_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_nodes_atom_id_fkey"
            columns: ["atom_id"]
            isOneToOne: false
            referencedRelation: "atoms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_nodes_witness_id_fkey"
            columns: ["witness_id"]
            isOneToOne: false
            referencedRelation: "witness_envelopes"
            referencedColumns: ["id"]
          },
        ]
      }
      memory_snapshots: {
        Row: {
          atom_count: number
          atom_ids: string[]
          created_at: string
          id: string
          metadata: Json
          reason: string
          run_id: string | null
          snapshot_hash: string
        }
        Insert: {
          atom_count?: number
          atom_ids?: string[]
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string
          run_id?: string | null
          snapshot_hash: string
        }
        Update: {
          atom_count?: number
          atom_ids?: string[]
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string
          run_id?: string | null
          snapshot_hash?: string
        }
        Relationships: []
      }
      mission_steps: {
        Row: {
          action_summary: string
          artifacts_touched: Json
          completed_at: string | null
          confidence: number | null
          created_at: string
          id: string
          mission_id: string
          result: Json | null
          sequence_no: number
          started_at: string | null
          status: string
          tools_invoked: Json
          updated_at: string
          validation_summary: string | null
        }
        Insert: {
          action_summary: string
          artifacts_touched?: Json
          completed_at?: string | null
          confidence?: number | null
          created_at?: string
          id?: string
          mission_id: string
          result?: Json | null
          sequence_no: number
          started_at?: string | null
          status?: string
          tools_invoked?: Json
          updated_at?: string
          validation_summary?: string | null
        }
        Update: {
          action_summary?: string
          artifacts_touched?: Json
          completed_at?: string | null
          confidence?: number | null
          created_at?: string
          id?: string
          mission_id?: string
          result?: Json | null
          sequence_no?: number
          started_at?: string | null
          status?: string
          tools_invoked?: Json
          updated_at?: string
          validation_summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mission_steps_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      missions: {
        Row: {
          allowed_tools: Json
          autonomy_tier: number
          budget_limits: Json
          confidence_trajectory: Json
          created_at: string
          escalation_conditions: Json
          forbidden_actions: Json
          id: string
          metadata: Json
          objective: string
          risk_class: string
          rollback_plan: string | null
          run_id: string | null
          status: Database["public"]["Enums"]["mission_status"]
          stop_conditions: Json
          success_metrics: Json
          title: string
          updated_at: string
        }
        Insert: {
          allowed_tools?: Json
          autonomy_tier?: number
          budget_limits?: Json
          confidence_trajectory?: Json
          created_at?: string
          escalation_conditions?: Json
          forbidden_actions?: Json
          id?: string
          metadata?: Json
          objective: string
          risk_class?: string
          rollback_plan?: string | null
          run_id?: string | null
          status?: Database["public"]["Enums"]["mission_status"]
          stop_conditions?: Json
          success_metrics?: Json
          title: string
          updated_at?: string
        }
        Update: {
          allowed_tools?: Json
          autonomy_tier?: number
          budget_limits?: Json
          confidence_trajectory?: Json
          created_at?: string
          escalation_conditions?: Json
          forbidden_actions?: Json
          id?: string
          metadata?: Json
          objective?: string
          risk_class?: string
          rollback_plan?: string | null
          run_id?: string | null
          status?: Database["public"]["Enums"]["mission_status"]
          stop_conditions?: Json
          success_metrics?: Json
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      persona_history: {
        Row: {
          axis_scores: Json
          created_at: string
          id: string
          persona_selected: string
          rationale: string
          run_id: string
          user_feedback: string | null
        }
        Insert: {
          axis_scores?: Json
          created_at?: string
          id?: string
          persona_selected: string
          rationale: string
          run_id: string
          user_feedback?: string | null
        }
        Update: {
          axis_scores?: Json
          created_at?: string
          id?: string
          persona_selected?: string
          rationale?: string
          run_id?: string
          user_feedback?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "persona_history_persona_selected_fkey"
            columns: ["persona_selected"]
            isOneToOne: false
            referencedRelation: "persona_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      persona_profiles: {
        Row: {
          axis_edge: number
          axis_formality: number
          axis_pedagogy: number
          axis_wit: number
          created_at: string
          example_phrases: string[]
          id: string
          name: string
          updated_at: string
          voice_characteristics: Json
        }
        Insert: {
          axis_edge: number
          axis_formality: number
          axis_pedagogy: number
          axis_wit: number
          created_at?: string
          example_phrases?: string[]
          id?: string
          name: string
          updated_at?: string
          voice_characteristics?: Json
        }
        Update: {
          axis_edge?: number
          axis_formality?: number
          axis_pedagogy?: number
          axis_wit?: number
          created_at?: string
          example_phrases?: string[]
          id?: string
          name?: string
          updated_at?: string
          voice_characteristics?: Json
        }
        Relationships: []
      }
      plan_steps: {
        Row: {
          assigned_role: Database["public"]["Enums"]["apoe_role"]
          budget: Json
          budget_used: Json
          completed_at: string | null
          created_at: string
          depends_on: string[]
          description: string
          error: string | null
          gate_before: Database["public"]["Enums"]["gate_type"] | null
          gate_config: Json
          gate_details: Json | null
          gate_result: Database["public"]["Enums"]["gate_result"] | null
          id: string
          input_refs: string[]
          metadata: Json
          output_refs: string[]
          plan_id: string
          result: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["step_status"]
          step_index: number
          step_type: Database["public"]["Enums"]["plan_step_type"]
          title: string
          witness_id: string | null
        }
        Insert: {
          assigned_role: Database["public"]["Enums"]["apoe_role"]
          budget?: Json
          budget_used?: Json
          completed_at?: string | null
          created_at?: string
          depends_on?: string[]
          description?: string
          error?: string | null
          gate_before?: Database["public"]["Enums"]["gate_type"] | null
          gate_config?: Json
          gate_details?: Json | null
          gate_result?: Database["public"]["Enums"]["gate_result"] | null
          id?: string
          input_refs?: string[]
          metadata?: Json
          output_refs?: string[]
          plan_id: string
          result?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["step_status"]
          step_index?: number
          step_type: Database["public"]["Enums"]["plan_step_type"]
          title?: string
          witness_id?: string | null
        }
        Update: {
          assigned_role?: Database["public"]["Enums"]["apoe_role"]
          budget?: Json
          budget_used?: Json
          completed_at?: string | null
          created_at?: string
          depends_on?: string[]
          description?: string
          error?: string | null
          gate_before?: Database["public"]["Enums"]["gate_type"] | null
          gate_config?: Json
          gate_details?: Json | null
          gate_result?: Database["public"]["Enums"]["gate_result"] | null
          id?: string
          input_refs?: string[]
          metadata?: Json
          output_refs?: string[]
          plan_id?: string
          result?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["step_status"]
          step_index?: number
          step_type?: Database["public"]["Enums"]["plan_step_type"]
          title?: string
          witness_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_steps_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "execution_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_steps_witness_id_fkey"
            columns: ["witness_id"]
            isOneToOne: false
            referencedRelation: "witness_envelopes"
            referencedColumns: ["id"]
          },
        ]
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
      quartet_traces: {
        Row: {
          blast_radius: Json
          code_hash: string
          created_at: string
          docs_hash: string
          gate_result: Database["public"]["Enums"]["gate_result"]
          gate_threshold: number
          id: string
          metadata: Json
          parity_details: Json
          parity_score: number
          run_id: string
          tests_hash: string
          trace_hash: string
          witness_id: string | null
        }
        Insert: {
          blast_radius?: Json
          code_hash?: string
          created_at?: string
          docs_hash?: string
          gate_result?: Database["public"]["Enums"]["gate_result"]
          gate_threshold?: number
          id?: string
          metadata?: Json
          parity_details?: Json
          parity_score?: number
          run_id: string
          tests_hash?: string
          trace_hash?: string
          witness_id?: string | null
        }
        Update: {
          blast_radius?: Json
          code_hash?: string
          created_at?: string
          docs_hash?: string
          gate_result?: Database["public"]["Enums"]["gate_result"]
          gate_threshold?: number
          id?: string
          metadata?: Json
          parity_details?: Json
          parity_score?: number
          run_id?: string
          tests_hash?: string
          trace_hash?: string
          witness_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quartet_traces_witness_id_fkey"
            columns: ["witness_id"]
            isOneToOne: false
            referencedRelation: "witness_envelopes"
            referencedColumns: ["id"]
          },
        ]
      }
      run_traces: {
        Row: {
          approach: string
          avg_score: number | null
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          generated_rules: Json
          goal: string
          id: string
          knowledge_update: Json | null
          memory_loaded: Json
          open_questions: string[]
          overall_complexity: string
          planning_reasoning: string
          planning_score: number | null
          reflection: Json | null
          run_id: string
          status: string
          strategy_score: number | null
          task_count: number
          tasks_detail: Json
          tasks_passed: number
          thoughts: Json
          total_tokens: number
        }
        Insert: {
          approach?: string
          avg_score?: number | null
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          generated_rules?: Json
          goal: string
          id?: string
          knowledge_update?: Json | null
          memory_loaded?: Json
          open_questions?: string[]
          overall_complexity?: string
          planning_reasoning?: string
          planning_score?: number | null
          reflection?: Json | null
          run_id: string
          status?: string
          strategy_score?: number | null
          task_count?: number
          tasks_detail?: Json
          tasks_passed?: number
          thoughts?: Json
          total_tokens?: number
        }
        Update: {
          approach?: string
          avg_score?: number | null
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          generated_rules?: Json
          goal?: string
          id?: string
          knowledge_update?: Json | null
          memory_loaded?: Json
          open_questions?: string[]
          overall_complexity?: string
          planning_reasoning?: string
          planning_score?: number | null
          reflection?: Json | null
          run_id?: string
          status?: string
          strategy_score?: number | null
          task_count?: number
          tasks_detail?: Json
          tasks_passed?: number
          thoughts?: Json
          total_tokens?: number
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
      witness_envelopes: {
        Row: {
          actual_accuracy: number | null
          atom_id: string | null
          confidence_band: Database["public"]["Enums"]["confidence_band"]
          confidence_score: number
          context_hash: string
          created_at: string
          ece_contribution: number | null
          id: string
          input_tokens: number
          kappa_gate_result: Database["public"]["Enums"]["kappa_gate_result"]
          kappa_threshold: number
          latency_ms: number | null
          metadata: Json
          model_id: string
          operation_type: Database["public"]["Enums"]["vif_operation_type"]
          output_tokens: number
          plan_step_id: string | null
          prompt_hash: string
          response_hash: string
          run_id: string | null
          task_id: string | null
        }
        Insert: {
          actual_accuracy?: number | null
          atom_id?: string | null
          confidence_band?: Database["public"]["Enums"]["confidence_band"]
          confidence_score?: number
          context_hash?: string
          created_at?: string
          ece_contribution?: number | null
          id?: string
          input_tokens?: number
          kappa_gate_result?: Database["public"]["Enums"]["kappa_gate_result"]
          kappa_threshold?: number
          latency_ms?: number | null
          metadata?: Json
          model_id?: string
          operation_type: Database["public"]["Enums"]["vif_operation_type"]
          output_tokens?: number
          plan_step_id?: string | null
          prompt_hash: string
          response_hash: string
          run_id?: string | null
          task_id?: string | null
        }
        Update: {
          actual_accuracy?: number | null
          atom_id?: string | null
          confidence_band?: Database["public"]["Enums"]["confidence_band"]
          confidence_score?: number
          context_hash?: string
          created_at?: string
          ece_contribution?: number | null
          id?: string
          input_tokens?: number
          kappa_gate_result?: Database["public"]["Enums"]["kappa_gate_result"]
          kappa_threshold?: number
          latency_ms?: number | null
          metadata?: Json
          model_id?: string
          operation_type?: Database["public"]["Enums"]["vif_operation_type"]
          output_tokens?: number
          plan_step_id?: string | null
          prompt_hash?: string
          response_hash?: string
          run_id?: string | null
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "witness_envelopes_atom_id_fkey"
            columns: ["atom_id"]
            isOneToOne: false
            referencedRelation: "atoms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      apoe_role:
        | "planner"
        | "retriever"
        | "reasoner"
        | "verifier"
        | "builder"
        | "critic"
        | "operator"
        | "witness"
      atom_type:
        | "text"
        | "code"
        | "decision"
        | "reflection"
        | "plan"
        | "verification"
        | "discovery"
        | "constraint"
        | "artifact"
      attention_breadth: "narrow" | "normal" | "wide"
      confidence_band: "A" | "B" | "C"
      failure_mode:
        | "categorization_error"
        | "activation_gap"
        | "procedure_gap"
        | "blind_spot"
        | "anchoring_bias"
        | "confirmation_bias"
        | "shortcut_taking"
      gate_result: "pass" | "fail" | "warn" | "abstain"
      gate_type: "quality" | "safety" | "policy"
      ion_authority_class:
        | "authority"
        | "witness"
        | "plan"
        | "audit"
        | "generated_state"
        | "stale_competitor"
      ion_delta_status: "proposed" | "accepted" | "rejected" | "witness_only"
      ion_protocol:
        | "reconnaissance"
        | "evidence"
        | "consolidation"
        | "review"
        | "signal"
        | "reflection"
        | "system_map"
        | "system_evolution"
      ion_question_status: "open" | "answered" | "deferred" | "cancelled"
      ion_run_status:
        | "created"
        | "reconnaissance"
        | "evidence_pass"
        | "consolidation"
        | "review"
        | "reconciliation"
        | "densification"
        | "expansion"
        | "blocked"
        | "completed"
        | "failed"
        | "stopped"
      ion_work_unit_status:
        | "pending"
        | "assigned"
        | "running"
        | "completed"
        | "failed"
        | "blocked"
        | "skipped"
      kappa_gate_result: "pass" | "abstain" | "fail"
      mission_status:
        | "drafted"
        | "awaiting_approval"
        | "approved"
        | "active"
        | "paused"
        | "blocked"
        | "completed"
        | "failed"
        | "aborted"
        | "rolled_back"
      plan_status: "draft" | "active" | "completed" | "failed" | "cancelled"
      plan_step_type:
        | "retrieve"
        | "reason"
        | "build"
        | "verify"
        | "critique"
        | "plan"
        | "witness"
        | "operate"
      step_status:
        | "pending"
        | "active"
        | "completed"
        | "failed"
        | "skipped"
        | "blocked"
      vif_operation_type:
        | "plan"
        | "execute"
        | "verify"
        | "reflect"
        | "critique"
        | "retrieve"
        | "build"
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
      apoe_role: [
        "planner",
        "retriever",
        "reasoner",
        "verifier",
        "builder",
        "critic",
        "operator",
        "witness",
      ],
      atom_type: [
        "text",
        "code",
        "decision",
        "reflection",
        "plan",
        "verification",
        "discovery",
        "constraint",
        "artifact",
      ],
      attention_breadth: ["narrow", "normal", "wide"],
      confidence_band: ["A", "B", "C"],
      failure_mode: [
        "categorization_error",
        "activation_gap",
        "procedure_gap",
        "blind_spot",
        "anchoring_bias",
        "confirmation_bias",
        "shortcut_taking",
      ],
      gate_result: ["pass", "fail", "warn", "abstain"],
      gate_type: ["quality", "safety", "policy"],
      ion_authority_class: [
        "authority",
        "witness",
        "plan",
        "audit",
        "generated_state",
        "stale_competitor",
      ],
      ion_delta_status: ["proposed", "accepted", "rejected", "witness_only"],
      ion_protocol: [
        "reconnaissance",
        "evidence",
        "consolidation",
        "review",
        "signal",
        "reflection",
        "system_map",
        "system_evolution",
      ],
      ion_question_status: ["open", "answered", "deferred", "cancelled"],
      ion_run_status: [
        "created",
        "reconnaissance",
        "evidence_pass",
        "consolidation",
        "review",
        "reconciliation",
        "densification",
        "expansion",
        "blocked",
        "completed",
        "failed",
        "stopped",
      ],
      ion_work_unit_status: [
        "pending",
        "assigned",
        "running",
        "completed",
        "failed",
        "blocked",
        "skipped",
      ],
      kappa_gate_result: ["pass", "abstain", "fail"],
      mission_status: [
        "drafted",
        "awaiting_approval",
        "approved",
        "active",
        "paused",
        "blocked",
        "completed",
        "failed",
        "aborted",
        "rolled_back",
      ],
      plan_status: ["draft", "active", "completed", "failed", "cancelled"],
      plan_step_type: [
        "retrieve",
        "reason",
        "build",
        "verify",
        "critique",
        "plan",
        "witness",
        "operate",
      ],
      step_status: [
        "pending",
        "active",
        "completed",
        "failed",
        "skipped",
        "blocked",
      ],
      vif_operation_type: [
        "plan",
        "execute",
        "verify",
        "reflect",
        "critique",
        "retrieve",
        "build",
      ],
    },
  },
} as const
