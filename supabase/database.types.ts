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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      griot_admin_audit_events: {
        Row: {
          action: string
          actor_id: string
          conversation_id: string | null
          created_at: string
          id: string
          message_id: string | null
          metadata: Json
          reason: string
          workspace_id: string | null
        }
        Insert: {
          action: string
          actor_id: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          message_id?: string | null
          metadata?: Json
          reason: string
          workspace_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          message_id?: string | null
          metadata?: Json
          reason?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "griot_admin_audit_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "griot_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "griot_admin_audit_events_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "griot_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "griot_admin_audit_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "griot_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_admin_enforcement_actions: {
        Row: {
          action: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          investigation_id: string | null
          reason: string
          revoked_at: string | null
          target_user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          investigation_id?: string | null
          reason: string
          revoked_at?: string | null
          target_user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          investigation_id?: string | null
          reason?: string
          revoked_at?: string | null
          target_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_admin_enforcement_actions_investigation_id_fkey"
            columns: ["investigation_id"]
            isOneToOne: false
            referencedRelation: "griot_admin_investigations"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_admin_investigations: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string | null
          evidence: Json
          id: string
          reason: string
          resolution: string | null
          resolved_at: string | null
          risk_level: string
          signals: Json
          status: string
          target_user_id: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          evidence?: Json
          id?: string
          reason: string
          resolution?: string | null
          resolved_at?: string | null
          risk_level?: string
          signals?: Json
          status?: string
          target_user_id: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          evidence?: Json
          id?: string
          reason?: string
          resolution?: string | null
          resolved_at?: string | null
          risk_level?: string
          signals?: Json
          status?: string
          target_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      griot_admin_role_assignments: {
        Row: {
          active: boolean
          created_at: string
          granted_by: string | null
          id: string
          revoked_at: string | null
          role_id: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          granted_by?: string | null
          id?: string
          revoked_at?: string | null
          role_id: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          granted_by?: string | null
          id?: string
          revoked_at?: string | null
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_admin_role_assignments_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "griot_admin_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_admin_roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      griot_admin_sensitive_access: {
        Row: {
          actor_id: string
          created_at: string
          id: string
          investigation_id: string | null
          purpose: string
          resource_id: string | null
          resource_type: string
          target_user_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          id?: string
          investigation_id?: string | null
          purpose: string
          resource_id?: string | null
          resource_type: string
          target_user_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          id?: string
          investigation_id?: string | null
          purpose?: string
          resource_id?: string | null
          resource_type?: string
          target_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_admin_sensitive_access_investigation_id_fkey"
            columns: ["investigation_id"]
            isOneToOne: false
            referencedRelation: "griot_admin_investigations"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_artifacts: {
        Row: {
          byte_size: number
          content_type: string
          conversation_id: string | null
          created_at: string
          created_by: string
          etag: string | null
          filename: string
          id: string
          object_key: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          byte_size: number
          content_type?: string
          conversation_id?: string | null
          created_at?: string
          created_by: string
          etag?: string | null
          filename: string
          id?: string
          object_key: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          byte_size?: number
          content_type?: string
          conversation_id?: string | null
          created_at?: string
          created_by?: string
          etag?: string | null
          filename?: string
          id?: string
          object_key?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_artifacts_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "griot_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "griot_artifacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "griot_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_conversation_events: {
        Row: {
          conversation_id: string
          created_at: string
          event_type: string
          id: string
          message_id: string | null
          payload: Json
          workspace_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          event_type: string
          id?: string
          message_id?: string | null
          payload?: Json
          workspace_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          event_type?: string
          id?: string
          message_id?: string | null
          payload?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_conversation_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "griot_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "griot_conversation_events_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "griot_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "griot_conversation_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "griot_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_conversations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          owner_id: string
          project_id: string | null
          title: string
          training_opt_in: boolean
          training_opted_in_at: string | null
          training_opted_in_by: string | null
          training_review_status: string
          training_reviewed_at: string | null
          training_reviewed_by: string | null
          updated_at: string
          visibility: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          owner_id: string
          project_id?: string | null
          title?: string
          training_opt_in?: boolean
          training_opted_in_at?: string | null
          training_opted_in_by?: string | null
          training_review_status?: string
          training_reviewed_at?: string | null
          training_reviewed_by?: string | null
          updated_at?: string
          visibility?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          owner_id?: string
          project_id?: string | null
          title?: string
          training_opt_in?: boolean
          training_opted_in_at?: string | null
          training_opted_in_by?: string | null
          training_review_status?: string
          training_reviewed_at?: string | null
          training_reviewed_by?: string | null
          updated_at?: string
          visibility?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "griot_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_credential_secrets: {
        Row: {
          created_at: string
          credential_id: string
          secret_ciphertext: string
          secret_iv: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credential_id: string
          secret_ciphertext: string
          secret_iv: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credential_id?: string
          secret_ciphertext?: string
          secret_iv?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_credential_secrets_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: true
            referencedRelation: "griot_credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_credentials: {
        Row: {
          created_at: string
          created_by: string
          fingerprint: string
          id: string
          kind: string
          label: string
          provider_id: string
          secret_hint: string
          settings: Json
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          fingerprint: string
          id?: string
          kind: string
          label: string
          provider_id: string
          secret_hint: string
          settings?: Json
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          fingerprint?: string
          id?: string
          kind?: string
          label?: string
          provider_id?: string
          secret_hint?: string
          settings?: Json
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_credentials_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "griot_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_desktop_builds: {
        Row: {
          artifact_id: string
          created_at: string
          created_by: string
          display_name: string
          id: string
          platform: string
          status: string
          updated_at: string
          version: string
          workspace_id: string
        }
        Insert: {
          artifact_id: string
          created_at?: string
          created_by: string
          display_name: string
          id?: string
          platform?: string
          status?: string
          updated_at?: string
          version?: string
          workspace_id: string
        }
        Update: {
          artifact_id?: string
          created_at?: string
          created_by?: string
          display_name?: string
          id?: string
          platform?: string
          status?: string
          updated_at?: string
          version?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_desktop_builds_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: true
            referencedRelation: "griot_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "griot_desktop_builds_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "griot_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_fabric_approvals: {
        Row: {
          action_id: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          input_sha256: string
          provider_id: string
          reason: string
          status: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          action_id: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          input_sha256: string
          provider_id: string
          reason: string
          status?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          action_id?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          input_sha256?: string
          provider_id?: string
          reason?: string
          status?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_fabric_approvals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "griot_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_fabric_context_bindings: {
        Row: {
          action_id: string
          active: boolean
          audiences: string[]
          created_at: string
          created_by: string
          fixed_input: Json
          id: string
          max_bytes: number
          name: string
          provider_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          action_id: string
          active?: boolean
          audiences?: string[]
          created_at?: string
          created_by: string
          fixed_input?: Json
          id?: string
          max_bytes?: number
          name: string
          provider_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          action_id?: string
          active?: boolean
          audiences?: string[]
          created_at?: string
          created_by?: string
          fixed_input?: Json
          id?: string
          max_bytes?: number
          name?: string
          provider_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_fabric_context_bindings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "griot_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_fabric_executions: {
        Row: {
          action_id: string
          approval_id: string | null
          completed_at: string | null
          duration_ms: number | null
          effect: string
          error_message: string | null
          id: string
          input_sha256: string
          metadata: Json
          provider_http_status: number | null
          provider_id: string
          provider_request_id: string | null
          result_preview: Json | null
          result_sha256: string | null
          started_at: string
          status: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          action_id: string
          approval_id?: string | null
          completed_at?: string | null
          duration_ms?: number | null
          effect: string
          error_message?: string | null
          id?: string
          input_sha256: string
          metadata?: Json
          provider_http_status?: number | null
          provider_id: string
          provider_request_id?: string | null
          result_preview?: Json | null
          result_sha256?: string | null
          started_at?: string
          status: string
          user_id: string
          workspace_id: string
        }
        Update: {
          action_id?: string
          approval_id?: string | null
          completed_at?: string | null
          duration_ms?: number | null
          effect?: string
          error_message?: string | null
          id?: string
          input_sha256?: string
          metadata?: Json
          provider_http_status?: number | null
          provider_id?: string
          provider_request_id?: string | null
          result_preview?: Json | null
          result_sha256?: string | null
          started_at?: string
          status?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_fabric_executions_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "griot_fabric_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "griot_fabric_executions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "griot_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_gcu_calibrations: {
        Row: {
          created_at: string
          effective_from: string
          formula: Json
          reason: string
          status: string
          version: string
        }
        Insert: {
          created_at?: string
          effective_from: string
          formula: Json
          reason: string
          status: string
          version: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          formula?: Json
          reason?: string
          status?: string
          version?: string
        }
        Relationships: []
      }
      griot_gcu_executions: {
        Row: {
          actual_gcu: number | null
          calibration_version: string
          completed_at: string | null
          failure_class: string | null
          id: string
          idempotency_key: string
          metadata: Json
          project_id: string | null
          request_sha256: string
          reserved_gcu: number
          started_at: string
          status: string
          unpaid_gcu: number
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          actual_gcu?: number | null
          calibration_version: string
          completed_at?: string | null
          failure_class?: string | null
          id?: string
          idempotency_key: string
          metadata?: Json
          project_id?: string | null
          request_sha256: string
          reserved_gcu?: number
          started_at?: string
          status?: string
          unpaid_gcu?: number
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          actual_gcu?: number | null
          calibration_version?: string
          completed_at?: string | null
          failure_class?: string | null
          id?: string
          idempotency_key?: string
          metadata?: Json
          project_id?: string | null
          request_sha256?: string
          reserved_gcu?: number
          started_at?: string
          status?: string
          unpaid_gcu?: number
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_gcu_executions_calibration_version_fkey"
            columns: ["calibration_version"]
            isOneToOne: false
            referencedRelation: "griot_gcu_calibrations"
            referencedColumns: ["version"]
          },
          {
            foreignKeyName: "griot_gcu_executions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "griot_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_gcu_ledger: {
        Row: {
          amount_gcu: number
          balance_delta_gcu: number
          calibration_version: string | null
          created_at: string
          debt_delta_gcu: number
          event_type: string
          execution_id: string | null
          id: string
          idempotency_key: string
          metadata: Json
          reason: string
          reserved_delta_gcu: number
          source: string
          workspace_id: string
        }
        Insert: {
          amount_gcu: number
          balance_delta_gcu?: number
          calibration_version?: string | null
          created_at?: string
          debt_delta_gcu?: number
          event_type: string
          execution_id?: string | null
          id?: string
          idempotency_key: string
          metadata?: Json
          reason: string
          reserved_delta_gcu?: number
          source: string
          workspace_id: string
        }
        Update: {
          amount_gcu?: number
          balance_delta_gcu?: number
          calibration_version?: string | null
          created_at?: string
          debt_delta_gcu?: number
          event_type?: string
          execution_id?: string | null
          id?: string
          idempotency_key?: string
          metadata?: Json
          reason?: string
          reserved_delta_gcu?: number
          source?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_gcu_ledger_calibration_version_fkey"
            columns: ["calibration_version"]
            isOneToOne: false
            referencedRelation: "griot_gcu_calibrations"
            referencedColumns: ["version"]
          },
          {
            foreignKeyName: "griot_gcu_ledger_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "griot_gcu_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "griot_gcu_ledger_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "griot_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_gcu_policies: {
        Row: {
          created_at: string
          execution_limit_gcu: number | null
          mode: string
          monthly_limit_gcu: number | null
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          execution_limit_gcu?: number | null
          mode?: string
          monthly_limit_gcu?: number | null
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          execution_limit_gcu?: number | null
          mode?: string
          monthly_limit_gcu?: number | null
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_gcu_policies_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "griot_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_gcu_usage: {
        Row: {
          checkpoint_sequence: number
          component: string
          duration_ms: number | null
          execution_id: string
          gcu_amount: number
          hardware_class: string
          id: string
          idempotency_key: string
          metadata: Json
          metrics: Json
          normalized_units: number
          occurred_at: string
          operation: string
          origin: string
          project_id: string | null
          resource_class: string
          scope_id: string
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          checkpoint_sequence?: number
          component: string
          duration_ms?: number | null
          execution_id: string
          gcu_amount: number
          hardware_class: string
          id?: string
          idempotency_key: string
          metadata?: Json
          metrics: Json
          normalized_units: number
          occurred_at?: string
          operation: string
          origin?: string
          project_id?: string | null
          resource_class: string
          scope_id: string
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          checkpoint_sequence?: number
          component?: string
          duration_ms?: number | null
          execution_id?: string
          gcu_amount?: number
          hardware_class?: string
          id?: string
          idempotency_key?: string
          metadata?: Json
          metrics?: Json
          normalized_units?: number
          occurred_at?: string
          operation?: string
          origin?: string
          project_id?: string | null
          resource_class?: string
          scope_id?: string
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_gcu_usage_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "griot_gcu_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "griot_gcu_usage_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "griot_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_gcu_wallets: {
        Row: {
          balance_gcu: number
          debt_gcu: number
          lifetime_used_gcu: number
          reserved_gcu: number
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          balance_gcu?: number
          debt_gcu?: number
          lifetime_used_gcu?: number
          reserved_gcu?: number
          updated_at?: string
          version?: number
          workspace_id: string
        }
        Update: {
          balance_gcu?: number
          debt_gcu?: number
          lifetime_used_gcu?: number
          reserved_gcu?: number
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_gcu_wallets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "griot_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_gpu_mission_events: {
        Row: {
          created_at: string
          event_hash: string
          event_type: string
          id: string
          mission_id: string
          payload: Json
          previous_hash: string
          sequence: number
          wave: number
        }
        Insert: {
          created_at?: string
          event_hash: string
          event_type: string
          id?: string
          mission_id: string
          payload?: Json
          previous_hash: string
          sequence: number
          wave?: number
        }
        Update: {
          created_at?: string
          event_hash?: string
          event_type?: string
          id?: string
          mission_id?: string
          payload?: Json
          previous_hash?: string
          sequence?: number
          wave?: number
        }
        Relationships: [
          {
            foreignKeyName: "griot_gpu_mission_events_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "griot_gpu_missions"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_gpu_missions: {
        Row: {
          certificate: Json | null
          completed_at: string | null
          cost_gcu: number
          created_at: string
          current_wave: number
          error_message: string | null
          id: string
          intent: string
          manifest: Json
          status: string
          summary: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          certificate?: Json | null
          completed_at?: string | null
          cost_gcu?: number
          created_at?: string
          current_wave?: number
          error_message?: string | null
          id?: string
          intent: string
          manifest?: Json
          status?: string
          summary?: string | null
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          certificate?: Json | null
          completed_at?: string | null
          cost_gcu?: number
          created_at?: string
          current_wave?: number
          error_message?: string | null
          id?: string
          intent?: string
          manifest?: Json
          status?: string
          summary?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_gpu_missions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "griot_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_messages: {
        Row: {
          actor_kind: string
          content: string
          conversation_id: string
          created_at: string
          error_message: string | null
          id: string
          metadata: Json
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          actor_kind: string
          content?: string
          conversation_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json
          status: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          actor_kind?: string
          content?: string
          conversation_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "griot_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "griot_messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "griot_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_opb_context_receipts: {
        Row: {
          budget_chars: number
          compiled_sha256: string
          context_text: string
          created_at: string
          created_by: string
          id: string
          project_id: string | null
          query: string
          selected_sources: Json
          workspace_id: string
        }
        Insert: {
          budget_chars: number
          compiled_sha256: string
          context_text: string
          created_at?: string
          created_by: string
          id?: string
          project_id?: string | null
          query: string
          selected_sources: Json
          workspace_id: string
        }
        Update: {
          budget_chars?: number
          compiled_sha256?: string
          context_text?: string
          created_at?: string
          created_by?: string
          id?: string
          project_id?: string | null
          query?: string
          selected_sources?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_opb_context_receipts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "griot_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_opb_edges: {
        Row: {
          created_at: string
          edge_type: string
          id: string
          metadata: Json
          project_id: string | null
          source_id: string
          target_ref: string
          target_source_id: string | null
          weight: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          edge_type: string
          id?: string
          metadata?: Json
          project_id?: string | null
          source_id: string
          target_ref: string
          target_source_id?: string | null
          weight?: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          edge_type?: string
          id?: string
          metadata?: Json
          project_id?: string | null
          source_id?: string
          target_ref?: string
          target_source_id?: string | null
          weight?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_opb_edges_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "griot_opb_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "griot_opb_edges_target_source_id_fkey"
            columns: ["target_source_id"]
            isOneToOne: false
            referencedRelation: "griot_opb_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "griot_opb_edges_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "griot_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_opb_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json
          project_id: string | null
          source_id: string | null
          workspace_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          project_id?: string | null
          source_id?: string | null
          workspace_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          project_id?: string | null
          source_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_opb_events_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "griot_opb_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "griot_opb_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "griot_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_opb_memories: {
        Row: {
          actor_id: string | null
          confidence: number
          confidence_basis: string
          created_at: string
          failure_reason: string
          id: string
          lesson: string
          memory_type: string
          metadata: Json
          origin_ref: string
          origin_type: string
          outcome: string
          project_id: string | null
          rationale: string
          revision: number
          search_vector: unknown
          statement: string
          status: string
          subject: string
          supersedes_id: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          actor_id?: string | null
          confidence?: number
          confidence_basis?: string
          created_at?: string
          failure_reason?: string
          id?: string
          lesson?: string
          memory_type: string
          metadata?: Json
          origin_ref?: string
          origin_type?: string
          outcome?: string
          project_id?: string | null
          rationale?: string
          revision?: number
          search_vector?: unknown
          statement: string
          status?: string
          subject?: string
          supersedes_id?: string | null
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          actor_id?: string | null
          confidence?: number
          confidence_basis?: string
          created_at?: string
          failure_reason?: string
          id?: string
          lesson?: string
          memory_type?: string
          metadata?: Json
          origin_ref?: string
          origin_type?: string
          outcome?: string
          project_id?: string | null
          rationale?: string
          revision?: number
          search_vector?: unknown
          statement?: string
          status?: string
          subject?: string
          supersedes_id?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_opb_memories_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "griot_studio_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "griot_opb_memories_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "griot_opb_memories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "griot_opb_memories_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "griot_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_opb_memory_evidence: {
        Row: {
          created_at: string
          memory_id: string
          metadata: Json
          relation: string
          source_id: string
          weight: number
        }
        Insert: {
          created_at?: string
          memory_id: string
          metadata?: Json
          relation: string
          source_id: string
          weight?: number
        }
        Update: {
          created_at?: string
          memory_id?: string
          metadata?: Json
          relation?: string
          source_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "griot_opb_memory_evidence_memory_id_fkey"
            columns: ["memory_id"]
            isOneToOne: false
            referencedRelation: "griot_opb_memories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "griot_opb_memory_evidence_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "griot_opb_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_opb_memory_links: {
        Row: {
          created_at: string
          from_memory_id: string
          id: string
          metadata: Json
          project_id: string
          relation: string
          to_memory_id: string
          weight: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          from_memory_id: string
          id?: string
          metadata?: Json
          project_id: string
          relation: string
          to_memory_id: string
          weight?: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          from_memory_id?: string
          id?: string
          metadata?: Json
          project_id?: string
          relation?: string
          to_memory_id?: string
          weight?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_opb_memory_links_from_memory_id_fkey"
            columns: ["from_memory_id"]
            isOneToOne: false
            referencedRelation: "griot_opb_memories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "griot_opb_memory_links_to_memory_id_fkey"
            columns: ["to_memory_id"]
            isOneToOne: false
            referencedRelation: "griot_opb_memories"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_opb_project_state: {
        Row: {
          architecture: string
          blocked: Json
          completed: Json
          confidence: number
          confidence_basis: string
          created_at: string
          current_goal: string
          id: string
          in_progress: Json
          open_decisions: Json
          project_id: string
          revision: number
          risks: Json
          status: string
          summary: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          architecture?: string
          blocked?: Json
          completed?: Json
          confidence?: number
          confidence_basis?: string
          created_at?: string
          current_goal?: string
          id?: string
          in_progress?: Json
          open_decisions?: Json
          project_id: string
          revision?: number
          risks?: Json
          status?: string
          summary?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          architecture?: string
          blocked?: Json
          completed?: Json
          confidence?: number
          confidence_basis?: string
          created_at?: string
          current_goal?: string
          id?: string
          in_progress?: Json
          open_decisions?: Json
          project_id?: string
          revision?: number
          risks?: Json
          status?: string
          summary?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_opb_project_state_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "griot_studio_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "griot_opb_project_state_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "griot_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_opb_snapshots: {
        Row: {
          created_at: string
          created_by: string
          id: string
          label: string | null
          manifest: Json
          project_id: string | null
          root_sha256: string
          source_count: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          label?: string | null
          manifest: Json
          project_id?: string | null
          root_sha256: string
          source_count: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          label?: string | null
          manifest?: Json
          project_id?: string | null
          root_sha256?: string
          source_count?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_opb_snapshots_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "griot_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_opb_sources: {
        Row: {
          content: string
          content_sha256: string
          created_at: string
          created_by: string
          id: string
          language: string | null
          metadata: Json
          project_id: string | null
          revision: number
          search_vector: unknown
          source_ref: string
          source_type: string
          status: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          content?: string
          content_sha256: string
          created_at?: string
          created_by: string
          id?: string
          language?: string | null
          metadata?: Json
          project_id?: string | null
          revision?: number
          search_vector?: unknown
          source_ref: string
          source_type: string
          status?: string
          title?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          content?: string
          content_sha256?: string
          created_at?: string
          created_by?: string
          id?: string
          language?: string | null
          metadata?: Json
          project_id?: string | null
          revision?: number
          search_vector?: unknown
          source_ref?: string
          source_type?: string
          status?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_opb_sources_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "griot_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_opb_symbols: {
        Row: {
          created_at: string
          id: string
          kind: string
          line_end: number | null
          line_start: number | null
          metadata: Json
          name: string
          project_id: string | null
          qualified_name: string | null
          source_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          line_end?: number | null
          line_start?: number | null
          metadata?: Json
          name: string
          project_id?: string | null
          qualified_name?: string | null
          source_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          line_end?: number | null
          line_start?: number | null
          metadata?: Json
          name?: string
          project_id?: string | null
          qualified_name?: string | null
          source_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_opb_symbols_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "griot_opb_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "griot_opb_symbols_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "griot_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_orchestrator_requests: {
        Row: {
          completed_at: string | null
          context_receipt_id: string | null
          conversation_id: string | null
          created_at: string
          error_message: string | null
          fabric_execution_ids: string[]
          human_message_id: string | null
          id: string
          idempotency_key: string
          metadata: Json
          model_id: string
          model_message_id: string | null
          provider_id: string
          request_sha256: string
          status: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          context_receipt_id?: string | null
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          fabric_execution_ids?: string[]
          human_message_id?: string | null
          id?: string
          idempotency_key: string
          metadata?: Json
          model_id: string
          model_message_id?: string | null
          provider_id: string
          request_sha256: string
          status?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          context_receipt_id?: string | null
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          fabric_execution_ids?: string[]
          human_message_id?: string | null
          id?: string
          idempotency_key?: string
          metadata?: Json
          model_id?: string
          model_message_id?: string | null
          provider_id?: string
          request_sha256?: string
          status?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_orchestrator_requests_context_receipt_id_fkey"
            columns: ["context_receipt_id"]
            isOneToOne: false
            referencedRelation: "griot_opb_context_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "griot_orchestrator_requests_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "griot_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "griot_orchestrator_requests_human_message_id_fkey"
            columns: ["human_message_id"]
            isOneToOne: false
            referencedRelation: "griot_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "griot_orchestrator_requests_model_message_id_fkey"
            columns: ["model_message_id"]
            isOneToOne: false
            referencedRelation: "griot_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "griot_orchestrator_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "griot_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_pipeline_configs: {
        Row: {
          created_at: string
          created_by: string
          nodes: Json
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          nodes?: Json
          updated_at?: string
          version?: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          nodes?: Json
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_pipeline_configs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "griot_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_platform_admins: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      griot_provider_usage_events: {
        Row: {
          cached_input_tokens: number | null
          completed_at: string | null
          conversation_id: string | null
          cost_confidence: string
          created_at: string
          currency: string
          error_message: string | null
          estimated_cost_usd: number | null
          id: string
          input_tokens: number | null
          metadata: Json
          model_id: string
          occurred_at: string
          output_tokens: number | null
          provider_id: string
          reasoning_tokens: number | null
          request_count: number
          request_id: string
          started_at: string
          status: string
          total_tokens: number | null
          usage_source: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          cached_input_tokens?: number | null
          completed_at?: string | null
          conversation_id?: string | null
          cost_confidence: string
          created_at?: string
          currency?: string
          error_message?: string | null
          estimated_cost_usd?: number | null
          id?: string
          input_tokens?: number | null
          metadata?: Json
          model_id: string
          occurred_at?: string
          output_tokens?: number | null
          provider_id: string
          reasoning_tokens?: number | null
          request_count?: number
          request_id: string
          started_at?: string
          status: string
          total_tokens?: number | null
          usage_source: string
          user_id: string
          workspace_id: string
        }
        Update: {
          cached_input_tokens?: number | null
          completed_at?: string | null
          conversation_id?: string | null
          cost_confidence?: string
          created_at?: string
          currency?: string
          error_message?: string | null
          estimated_cost_usd?: number | null
          id?: string
          input_tokens?: number | null
          metadata?: Json
          model_id?: string
          occurred_at?: string
          output_tokens?: number | null
          provider_id?: string
          reasoning_tokens?: number | null
          request_count?: number
          request_id?: string
          started_at?: string
          status?: string
          total_tokens?: number | null
          usage_source?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_provider_usage_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "griot_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "griot_provider_usage_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "griot_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_provider_usage_policies: {
        Row: {
          auto_economy: boolean
          created_at: string
          critical_percent: number
          daily_request_limit: number | null
          daily_token_limit: number | null
          hard_stop_percent: number
          monthly_budget_usd: number | null
          paid_fallback_requires_approval: boolean
          provider_id: string
          updated_at: string
          updated_by: string | null
          warning_percent: number
          workspace_id: string
        }
        Insert: {
          auto_economy?: boolean
          created_at?: string
          critical_percent?: number
          daily_request_limit?: number | null
          daily_token_limit?: number | null
          hard_stop_percent?: number
          monthly_budget_usd?: number | null
          paid_fallback_requires_approval?: boolean
          provider_id: string
          updated_at?: string
          updated_by?: string | null
          warning_percent?: number
          workspace_id: string
        }
        Update: {
          auto_economy?: boolean
          created_at?: string
          critical_percent?: number
          daily_request_limit?: number | null
          daily_token_limit?: number | null
          hard_stop_percent?: number
          monthly_budget_usd?: number | null
          paid_fallback_requires_approval?: boolean
          provider_id?: string
          updated_at?: string
          updated_by?: string | null
          warning_percent?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_provider_usage_policies_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "griot_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_studio_agent_permissions: {
        Row: {
          full_access: boolean
          project_id: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          full_access?: boolean
          project_id: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          full_access?: boolean
          project_id?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_studio_agent_permissions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "griot_studio_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "griot_studio_agent_permissions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "griot_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_studio_compute_connections: {
        Row: {
          capabilities: Json
          created_at: string
          id: string
          internal_connection_id: string
          label: string
          last_verified_at: string | null
          provider: string
          provider_account_hint: string | null
          status: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          capabilities?: Json
          created_at?: string
          id?: string
          internal_connection_id: string
          label: string
          last_verified_at?: string | null
          provider?: string
          provider_account_hint?: string | null
          status?: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          capabilities?: Json
          created_at?: string
          id?: string
          internal_connection_id?: string
          label?: string
          last_verified_at?: string | null
          provider?: string
          provider_account_hint?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_studio_compute_connections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "griot_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_studio_compute_runs: {
        Row: {
          connection_id: string
          created_at: string
          finished_at: string | null
          id: string
          internal_run_id: string
          internal_task_id: string
          project_id: string
          provider: string
          repository_full_name: string
          repository_ref: string
          runtime_id: string
          source_commit_sha: string
          source_tree_sha: string
          status: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          connection_id: string
          created_at?: string
          finished_at?: string | null
          id?: string
          internal_run_id: string
          internal_task_id: string
          project_id: string
          provider?: string
          repository_full_name: string
          repository_ref: string
          runtime_id: string
          source_commit_sha: string
          source_tree_sha: string
          status?: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          connection_id?: string
          created_at?: string
          finished_at?: string | null
          id?: string
          internal_run_id?: string
          internal_task_id?: string
          project_id?: string
          provider?: string
          repository_full_name?: string
          repository_ref?: string
          runtime_id?: string
          source_commit_sha?: string
          source_tree_sha?: string
          status?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_studio_compute_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "griot_studio_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "griot_studio_compute_runs_runtime_fk"
            columns: ["runtime_id", "workspace_id", "project_id", "user_id"]
            isOneToOne: false
            referencedRelation: "griot_studio_runtimes"
            referencedColumns: ["id", "workspace_id", "project_id", "user_id"]
          },
          {
            foreignKeyName: "griot_studio_compute_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "griot_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_studio_projects: {
        Row: {
          archived: boolean
          brief: Json
          created_at: string
          description: string
          id: string
          name: string
          owner_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived?: boolean
          brief?: Json
          created_at?: string
          description?: string
          id?: string
          name: string
          owner_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived?: boolean
          brief?: Json
          created_at?: string
          description?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_studio_projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "griot_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_studio_repository_bindings: {
        Row: {
          binding_sha256: string
          created_at: string
          credential_id: string
          default_branch: string
          id: string
          metadata: Json
          metadata_execution_id: string
          metadata_result_sha256: string
          project_id: string
          provider: string
          ref: string
          ref_execution_id: string
          ref_result_sha256: string
          repository_full_name: string
          repository_id: number
          repository_name: string
          repository_owner: string
          revoked_at: string | null
          status: string
          updated_at: string
          verified_at: string
          verified_by: string
          workspace_id: string
        }
        Insert: {
          binding_sha256: string
          created_at?: string
          credential_id: string
          default_branch: string
          id?: string
          metadata?: Json
          metadata_execution_id: string
          metadata_result_sha256: string
          project_id: string
          provider?: string
          ref: string
          ref_execution_id: string
          ref_result_sha256: string
          repository_full_name: string
          repository_id: number
          repository_name: string
          repository_owner: string
          revoked_at?: string | null
          status?: string
          updated_at?: string
          verified_at?: string
          verified_by: string
          workspace_id: string
        }
        Update: {
          binding_sha256?: string
          created_at?: string
          credential_id?: string
          default_branch?: string
          id?: string
          metadata?: Json
          metadata_execution_id?: string
          metadata_result_sha256?: string
          project_id?: string
          provider?: string
          ref?: string
          ref_execution_id?: string
          ref_result_sha256?: string
          repository_full_name?: string
          repository_id?: number
          repository_name?: string
          repository_owner?: string
          revoked_at?: string | null
          status?: string
          updated_at?: string
          verified_at?: string
          verified_by?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_studio_repository_bindings_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "griot_credentials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "griot_studio_repository_bindings_metadata_execution_id_fkey"
            columns: ["metadata_execution_id"]
            isOneToOne: false
            referencedRelation: "griot_fabric_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "griot_studio_repository_bindings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "griot_studio_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "griot_studio_repository_bindings_ref_execution_id_fkey"
            columns: ["ref_execution_id"]
            isOneToOne: false
            referencedRelation: "griot_fabric_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "griot_studio_repository_bindings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "griot_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_studio_runtimes: {
        Row: {
          capabilities: Json
          connection_id: string
          created_at: string
          destroyed_at: string | null
          expires_at: string | null
          id: string
          last_active_at: string | null
          metadata: Json
          project_id: string
          provider: string
          resource_class: string | null
          runtime_key: string
          status: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          capabilities?: Json
          connection_id: string
          created_at?: string
          destroyed_at?: string | null
          expires_at?: string | null
          id?: string
          last_active_at?: string | null
          metadata?: Json
          project_id: string
          provider: string
          resource_class?: string | null
          runtime_key: string
          status?: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          capabilities?: Json
          connection_id?: string
          created_at?: string
          destroyed_at?: string | null
          expires_at?: string | null
          id?: string
          last_active_at?: string | null
          metadata?: Json
          project_id?: string
          provider?: string
          resource_class?: string | null
          runtime_key?: string
          status?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_studio_runtimes_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "griot_studio_compute_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "griot_studio_runtimes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "griot_studio_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "griot_studio_runtimes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "griot_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_studio_tasks: {
        Row: {
          created_at: string
          created_by: string
          id: string
          project_id: string
          status: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          project_id: string
          status?: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          project_id?: string
          status?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_studio_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "griot_studio_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "griot_studio_tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "griot_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      griot_workspace_members: {
        Row: {
          created_at: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          role: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "griot_workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "griot_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      griot_workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      griot_can_read_conversation: {
        Args: { target_conversation: string; target_workspace: string }
        Returns: boolean
      }
      griot_fabric_consume_approval: {
        Args: {
          p_action_id: string
          p_approval_id: string
          p_input_sha256: string
          p_provider_id: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: boolean
      }
      griot_gcu_grant: {
        Args: {
          p_actor_id: string
          p_amount: number
          p_idempotency_key: string
          p_reason: string
          p_source: string
          p_workspace_id: string
        }
        Returns: Json
      }
      griot_gcu_meter_event: {
        Args: {
          p_component: string
          p_duration_ms?: number
          p_idempotency_key: string
          p_metadata?: Json
          p_metrics: Json
          p_operation: string
          p_project_id?: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      griot_gcu_refund: {
        Args: {
          p_actor_id: string
          p_amount: number
          p_execution_id: string
          p_idempotency_key: string
          p_reason: string
          p_workspace_id: string
        }
        Returns: Json
      }
      griot_gcu_service_debt: {
        Args: {
          p_idempotency_prefix: string
          p_reason: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      griot_is_member: { Args: { target_workspace: string }; Returns: boolean }
      griot_is_platform_admin: { Args: never; Returns: boolean }
      griot_is_workspace_admin: {
        Args: { target_workspace: string }
        Returns: boolean
      }
      griot_opb_memory_context: {
        Args: {
          p_limit?: number
          p_project_id: string
          p_query?: string
          p_workspace_id: string
        }
        Returns: {
          confidence: number
          failure_reason: string
          id: string
          lesson: string
          memory_type: string
          outcome: string
          rank: number
          rationale: string
          revision: number
          statement: string
          status: string
          subject: string
          title: string
        }[]
      }
      griot_opb_memory_context_graph: {
        Args: {
          p_limit?: number
          p_project_id: string
          p_query: string
          p_related_limit?: number
          p_workspace_id: string
        }
        Returns: {
          confidence: number
          failure_reason: string
          lesson: string
          memory_id: string
          memory_type: string
          outcome: string
          rationale: string
          relation: string
          relation_weight: number
          source_memory_id: string
          statement: string
          status: string
          subject: string
          title: string
        }[]
      }
      griot_opb_record_memory: {
        Args: {
          p_actor_id?: string
          p_confidence?: number
          p_confidence_basis?: string
          p_evidence?: Json
          p_failure_reason?: string
          p_lesson?: string
          p_memory_type: string
          p_metadata?: Json
          p_origin_ref?: string
          p_origin_type?: string
          p_outcome?: string
          p_project_id: string
          p_rationale?: string
          p_statement: string
          p_status?: string
          p_subject: string
          p_supersedes_id?: string
          p_title: string
          p_workspace_id: string
        }
        Returns: string
      }
      griot_opb_search: {
        Args: {
          p_excerpt_chars?: number
          p_limit?: number
          p_project_id?: string
          p_query: string
          p_workspace_id: string
        }
        Returns: {
          content_sha256: string
          excerpt: string
          id: string
          language: string
          project_id: string
          rank: number
          revision: number
          source_ref: string
          source_type: string
          title: string
          updated_at: string
        }[]
      }
      griot_opb_set_project_state: {
        Args: {
          p_architecture?: string
          p_blocked?: Json
          p_completed?: Json
          p_confidence?: number
          p_confidence_basis?: string
          p_current_goal?: string
          p_in_progress?: Json
          p_open_decisions?: Json
          p_project_id: string
          p_risks?: Json
          p_status: string
          p_summary?: string
          p_updated_by?: string
          p_workspace_id: string
        }
        Returns: string
      }
      griot_opb_upsert_source: {
        Args: {
          p_content: string
          p_content_sha256: string
          p_created_by: string
          p_edges: Json
          p_language: string
          p_metadata: Json
          p_project_id: string
          p_source_ref: string
          p_source_type: string
          p_symbols: Json
          p_title: string
          p_workspace_id: string
        }
        Returns: {
          content: string
          content_sha256: string
          created_at: string
          created_by: string
          id: string
          language: string | null
          metadata: Json
          project_id: string | null
          revision: number
          search_vector: unknown
          source_ref: string
          source_type: string
          status: string
          title: string
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "griot_opb_sources"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      griot_publish_desktop_build: {
        Args: {
          p_artifact_id: string
          p_display_name: string
          p_version: string
          p_workspace_id: string
        }
        Returns: {
          artifact_id: string
          created_at: string
          created_by: string
          display_name: string
          id: string
          platform: string
          status: string
          updated_at: string
          version: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "griot_desktop_builds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      griot_studio_bind_repository: {
        Args: {
          p_binding_sha256: string
          p_credential_id: string
          p_default_branch: string
          p_metadata?: Json
          p_metadata_execution_id: string
          p_metadata_result_sha256: string
          p_project_id: string
          p_ref: string
          p_ref_execution_id: string
          p_ref_result_sha256: string
          p_repository_full_name: string
          p_repository_id: number
          p_repository_name: string
          p_repository_owner: string
          p_verified_by: string
          p_workspace_id: string
        }
        Returns: {
          binding_sha256: string
          created_at: string
          credential_id: string
          default_branch: string
          id: string
          metadata: Json
          metadata_execution_id: string
          metadata_result_sha256: string
          project_id: string
          provider: string
          ref: string
          ref_execution_id: string
          ref_result_sha256: string
          repository_full_name: string
          repository_id: number
          repository_name: string
          repository_owner: string
          revoked_at: string | null
          status: string
          updated_at: string
          verified_at: string
          verified_by: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "griot_studio_repository_bindings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      griot_studio_unbind_repository: {
        Args: {
          p_actor_id: string
          p_project_id: string
          p_workspace_id: string
        }
        Returns: boolean
      }
      griot_workspace_admin: {
        Args: { target_workspace: string }
        Returns: boolean
      }
      griot_workspace_member: {
        Args: { target_workspace: string }
        Returns: boolean
      }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
