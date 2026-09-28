export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      /**
       * NOTA: as tabelas capsule_* AINDA NAO EXISTEM no backend real.
       * Ficam aqui declaradas para o codigo das Capsulas compilar; qualquer
       * chamada falha em runtime com erro real ate serem criadas no servidor.
       */
      capsules: {
        Row: {
          archived_at: string | null;
          created_at: string;
          current_phase_id: string | null;
          deleted_at: string | null;
          description: string | null;
          due_at: string | null;
          group_work: boolean;
          id: string;
          name: string;
          status: string;
          subjects: string[];
          teacher: string | null;
          type: string;
          updated_at: string;
          user_id: string;
          work_kind: string | null;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          current_phase_id?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          due_at?: string | null;
          group_work?: boolean;
          id?: string;
          name: string;
          status?: string;
          subjects?: string[];
          teacher?: string | null;
          type?: string;
          updated_at?: string;
          user_id: string;
          work_kind?: string | null;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          current_phase_id?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          due_at?: string | null;
          group_work?: boolean;
          id?: string;
          name?: string;
          status?: string;
          subjects?: string[];
          teacher?: string | null;
          type?: string;
          updated_at?: string;
          user_id?: string;
          work_kind?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "capsules_current_phase_id_fkey";
            columns: ["current_phase_id"];
            isOneToOne: false;
            referencedRelation: "capsule_phases";
            referencedColumns: ["id"];
          },
        ];
      };
      capsule_activity: {
        Row: {
          action: string;
          capsule_id: string;
          created_at: string;
          id: string;
          ref_id: string | null;
          ref_type: string | null;
          summary: string;
          user_id: string;
        };
        Insert: {
          action: string;
          capsule_id: string;
          created_at?: string;
          id?: string;
          ref_id?: string | null;
          ref_type?: string | null;
          summary: string;
          user_id: string;
        };
        Update: {
          action?: string;
          capsule_id?: string;
          created_at?: string;
          id?: string;
          ref_id?: string | null;
          ref_type?: string | null;
          summary?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "capsule_activity_capsule_id_fkey";
            columns: ["capsule_id"];
            isOneToOne: false;
            referencedRelation: "capsules";
            referencedColumns: ["id"];
          },
        ];
      };
      capsule_asset_links: {
        Row: {
          asset_id: string;
          capsule_id: string;
          caption: string | null;
          created_at: string;
          id: string;
          layout: string | null;
          position: number;
          section: string | null;
          target_id: string | null;
          target_type: string;
          user_id: string;
        };
        Insert: {
          asset_id: string;
          capsule_id: string;
          caption?: string | null;
          created_at?: string;
          id?: string;
          layout?: string | null;
          position?: number;
          section?: string | null;
          target_id?: string | null;
          target_type: string;
          user_id: string;
        };
        Update: {
          asset_id?: string;
          capsule_id?: string;
          caption?: string | null;
          created_at?: string;
          id?: string;
          layout?: string | null;
          position?: number;
          section?: string | null;
          target_id?: string | null;
          target_type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "capsule_asset_links_asset_id_fkey";
            columns: ["asset_id"];
            isOneToOne: false;
            referencedRelation: "capsule_assets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "capsule_asset_links_capsule_id_fkey";
            columns: ["capsule_id"];
            isOneToOne: false;
            referencedRelation: "capsules";
            referencedColumns: ["id"];
          },
        ];
      };
      capsule_assets: {
        Row: {
          capsule_id: string;
          caption: string | null;
          created_at: string;
          deleted_at: string | null;
          description: string | null;
          id: string;
          mime_type: string | null;
          name: string;
          notes: string | null;
          source: string | null;
          status: string;
          storage_path: string;
          title: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          capsule_id: string;
          caption?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          id?: string;
          mime_type?: string | null;
          name: string;
          notes?: string | null;
          source?: string | null;
          status?: string;
          storage_path: string;
          title?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          capsule_id?: string;
          caption?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          id?: string;
          mime_type?: string | null;
          name?: string;
          notes?: string | null;
          source?: string | null;
          status?: string;
          storage_path?: string;
          title?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "capsule_assets_capsule_id_fkey";
            columns: ["capsule_id"];
            isOneToOne: false;
            referencedRelation: "capsules";
            referencedColumns: ["id"];
          },
        ];
      };
      capsule_decision_revisions: {
        Row: {
          actor: string;
          capsule_id: string;
          created_at: string;
          decision_id: string;
          description: string | null;
          id: string;
          reason: string | null;
          status: string;
          title: string;
          user_id: string;
          version: number;
        };
        Insert: {
          actor?: string;
          capsule_id: string;
          created_at?: string;
          decision_id: string;
          description?: string | null;
          id?: string;
          reason?: string | null;
          status: string;
          title: string;
          user_id: string;
          version: number;
        };
        Update: {
          actor?: string;
          capsule_id?: string;
          created_at?: string;
          decision_id?: string;
          description?: string | null;
          id?: string;
          reason?: string | null;
          status?: string;
          title?: string;
          user_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "capsule_decision_revisions_capsule_id_fkey";
            columns: ["capsule_id"];
            isOneToOne: false;
            referencedRelation: "capsules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "capsule_decision_revisions_decision_id_fkey";
            columns: ["decision_id"];
            isOneToOne: false;
            referencedRelation: "capsule_decisions";
            referencedColumns: ["id"];
          },
        ];
      };
      capsule_decisions: {
        Row: {
          affected_entities: string[];
          approved_at: string | null;
          approved_by: string | null;
          capsule_id: string;
          created_at: string;
          description: string | null;
          id: string;
          idempotency_key: string | null;
          metadata: Json;
          proposed_by: string;
          reason: string | null;
          section: string;
          status: string;
          superseded_at: string | null;
          superseded_by: string | null;
          tags: string[];
          title: string;
          updated_at: string;
          user_id: string;
          version: number;
        };
        Insert: {
          affected_entities?: string[];
          approved_at?: string | null;
          approved_by?: string | null;
          capsule_id: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          idempotency_key?: string | null;
          metadata?: Json;
          proposed_by?: string;
          reason?: string | null;
          section?: string;
          status?: string;
          superseded_at?: string | null;
          superseded_by?: string | null;
          tags?: string[];
          title: string;
          updated_at?: string;
          user_id: string;
          version?: number;
        };
        Update: {
          affected_entities?: string[];
          approved_at?: string | null;
          approved_by?: string | null;
          capsule_id?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          idempotency_key?: string | null;
          metadata?: Json;
          proposed_by?: string;
          reason?: string | null;
          section?: string;
          status?: string;
          superseded_at?: string | null;
          superseded_by?: string | null;
          tags?: string[];
          title?: string;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "capsule_decisions_capsule_id_fkey";
            columns: ["capsule_id"];
            isOneToOne: false;
            referencedRelation: "capsules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "capsule_decisions_superseded_by_fkey";
            columns: ["superseded_by"];
            isOneToOne: false;
            referencedRelation: "capsule_decisions";
            referencedColumns: ["id"];
          },
        ];
      };
      capsule_entities: {
        Row: {
          capsule_id: string;
          created_at: string;
          deleted_at: string | null;
          description: string | null;
          entity_type: string;
          id: string;
          name: string;
          properties: Json;
          status: string;
          updated_at: string;
          user_id: string;
          version: number;
        };
        Insert: {
          capsule_id: string;
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          entity_type?: string;
          id?: string;
          name: string;
          properties?: Json;
          status?: string;
          updated_at?: string;
          user_id: string;
          version?: number;
        };
        Update: {
          capsule_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          entity_type?: string;
          id?: string;
          name?: string;
          properties?: Json;
          status?: string;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "capsule_entities_capsule_id_fkey";
            columns: ["capsule_id"];
            isOneToOne: false;
            referencedRelation: "capsules";
            referencedColumns: ["id"];
          },
        ];
      };
      capsule_entity_relationships: {
        Row: {
          capsule_id: string;
          created_at: string;
          from_entity_id: string;
          id: string;
          relation: string;
          to_entity_id: string;
          user_id: string;
        };
        Insert: {
          capsule_id: string;
          created_at?: string;
          from_entity_id: string;
          id?: string;
          relation: string;
          to_entity_id: string;
          user_id: string;
        };
        Update: {
          capsule_id?: string;
          created_at?: string;
          from_entity_id?: string;
          id?: string;
          relation?: string;
          to_entity_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "capsule_entity_relationships_capsule_id_fkey";
            columns: ["capsule_id"];
            isOneToOne: false;
            referencedRelation: "capsules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "capsule_entity_relationships_from_entity_id_fkey";
            columns: ["from_entity_id"];
            isOneToOne: false;
            referencedRelation: "capsule_entities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "capsule_entity_relationships_to_entity_id_fkey";
            columns: ["to_entity_id"];
            isOneToOne: false;
            referencedRelation: "capsule_entities";
            referencedColumns: ["id"];
          },
        ];
      };
      capsule_phases: {
        Row: {
          capsule_id: string;
          created_at: string;
          id: string;
          position: number;
          status: string;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          capsule_id: string;
          created_at?: string;
          id?: string;
          position?: number;
          status?: string;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          capsule_id?: string;
          created_at?: string;
          id?: string;
          position?: number;
          status?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "capsule_phases_capsule_id_fkey";
            columns: ["capsule_id"];
            isOneToOne: false;
            referencedRelation: "capsules";
            referencedColumns: ["id"];
          },
        ];
      };
      dil_hypotheses_ledger: {
        Row: {
          id: string;
          incident_id: string;
          agent_id: string;
          claim: string;
          status: string;
          prior: number;
          confidence: number;
          likelihoods: Json | null;
          created_at: string;
        };
        Insert: {
          id: string;
          incident_id: string;
          agent_id: string;
          claim: string;
          status: string;
          prior: number;
          confidence: number;
          likelihoods?: Json | null;
          created_at: string;
        };
        Update: {
          id?: string;
          incident_id?: string;
          agent_id?: string;
          claim?: string;
          status?: string;
          prior?: number;
          confidence?: number;
          likelihoods?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      dil_incidents: {
        Row: {
          id: string;
          created_at: string;
          agent_id: string;
          fingerprint: string;
          target_module: string | null;
          failing_test: string | null;
          symptoms: Json;
          root_cause: string;
          winning_hypothesis: Json;
          rejected_hypotheses: Json;
          confidence: number;
          brier_score: number | null;
          patch_diff: string | null;
          validation_passed: boolean | null;
          tools_used: Json | null;
          environment: Json | null;
          error_embedding: string | null;
        };
        Insert: {
          id: string;
          created_at: string;
          agent_id: string;
          fingerprint: string;
          target_module?: string | null;
          failing_test?: string | null;
          symptoms: Json;
          root_cause: string;
          winning_hypothesis: Json;
          rejected_hypotheses: Json;
          confidence: number;
          brier_score?: number | null;
          patch_diff?: string | null;
          validation_passed?: boolean | null;
          tools_used?: Json | null;
          environment?: Json | null;
          error_embedding?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          agent_id?: string;
          fingerprint?: string;
          target_module?: string | null;
          failing_test?: string | null;
          symptoms?: Json;
          root_cause?: string;
          winning_hypothesis?: Json;
          rejected_hypotheses?: Json;
          confidence?: number;
          brier_score?: number | null;
          patch_diff?: string | null;
          validation_passed?: boolean | null;
          tools_used?: Json | null;
          environment?: Json | null;
          error_embedding?: string | null;
        };
        Relationships: [];
      };
      dil_spans: {
        Row: {
          id: string;
          incident_id: string | null;
          agent_id: string;
          span_name: string;
          duration_ms: number;
          thread_id: string | null;
          parent_span_id: string | null;
          attributes: Json | null;
          created_at: string;
        };
        Insert: {
          id: string;
          incident_id?: string | null;
          agent_id: string;
          span_name: string;
          duration_ms: number;
          thread_id?: string | null;
          parent_span_id?: string | null;
          attributes?: Json | null;
          created_at: string;
        };
        Update: {
          id?: string;
          incident_id?: string | null;
          agent_id?: string;
          span_name?: string;
          duration_ms?: number;
          thread_id?: string | null;
          parent_span_id?: string | null;
          attributes?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      griot_admin_audit_events: {
        Row: {
          id: string;
          actor_id: string;
          action: string;
          reason: string;
          workspace_id: string | null;
          conversation_id: string | null;
          message_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id: string;
          actor_id: string;
          action: string;
          reason: string;
          workspace_id?: string | null;
          conversation_id?: string | null;
          message_id?: string | null;
          metadata: Json;
          created_at: string;
        };
        Update: {
          id?: string;
          actor_id?: string;
          action?: string;
          reason?: string;
          workspace_id?: string | null;
          conversation_id?: string | null;
          message_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      griot_admin_enforcement_actions: {
        Row: {
          id: string;
          target_user_id: string;
          investigation_id: string | null;
          action: string;
          reason: string;
          expires_at: string | null;
          created_by: string;
          created_at: string;
          revoked_at: string | null;
        };
        Insert: {
          id: string;
          target_user_id: string;
          investigation_id?: string | null;
          action: string;
          reason: string;
          expires_at?: string | null;
          created_by: string;
          created_at: string;
          revoked_at?: string | null;
        };
        Update: {
          id?: string;
          target_user_id?: string;
          investigation_id?: string | null;
          action?: string;
          reason?: string;
          expires_at?: string | null;
          created_by?: string;
          created_at?: string;
          revoked_at?: string | null;
        };
        Relationships: [];
      };
      griot_admin_investigations: {
        Row: {
          id: string;
          target_user_id: string;
          status: string;
          risk_level: string;
          reason: string;
          signals: Json;
          evidence: Json;
          assigned_to: string | null;
          resolution: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          resolved_at: string | null;
        };
        Insert: {
          id: string;
          target_user_id: string;
          status: string;
          risk_level: string;
          reason: string;
          signals: Json;
          evidence: Json;
          assigned_to?: string | null;
          resolution?: string | null;
          created_by?: string | null;
          created_at: string;
          updated_at: string;
          resolved_at?: string | null;
        };
        Update: {
          id?: string;
          target_user_id?: string;
          status?: string;
          risk_level?: string;
          reason?: string;
          signals?: Json;
          evidence?: Json;
          assigned_to?: string | null;
          resolution?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          resolved_at?: string | null;
        };
        Relationships: [];
      };
      griot_admin_role_assignments: {
        Row: {
          id: string;
          user_id: string;
          role_id: string;
          active: boolean;
          granted_by: string | null;
          created_at: string;
          revoked_at: string | null;
        };
        Insert: {
          id: string;
          user_id: string;
          role_id: string;
          active: boolean;
          granted_by?: string | null;
          created_at: string;
          revoked_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          role_id?: string;
          active?: boolean;
          granted_by?: string | null;
          created_at?: string;
          revoked_at?: string | null;
        };
        Relationships: [];
      };
      griot_admin_roles: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          name: string;
          description?: string | null;
          created_at: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      griot_admin_sensitive_access: {
        Row: {
          id: string;
          actor_id: string;
          target_user_id: string;
          investigation_id: string | null;
          resource_type: string;
          resource_id: string | null;
          purpose: string;
          created_at: string;
        };
        Insert: {
          id: string;
          actor_id: string;
          target_user_id: string;
          investigation_id?: string | null;
          resource_type: string;
          resource_id?: string | null;
          purpose: string;
          created_at: string;
        };
        Update: {
          id?: string;
          actor_id?: string;
          target_user_id?: string;
          investigation_id?: string | null;
          resource_type?: string;
          resource_id?: string | null;
          purpose?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      griot_artifacts: {
        Row: {
          id: string;
          workspace_id: string;
          conversation_id: string | null;
          created_by: string;
          object_key: string;
          filename: string;
          content_type: string;
          byte_size: number;
          status: string;
          etag: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          workspace_id: string;
          conversation_id?: string | null;
          created_by: string;
          object_key: string;
          filename: string;
          content_type: string;
          byte_size: number;
          status: string;
          etag?: string | null;
          created_at: string;
          updated_at: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          conversation_id?: string | null;
          created_by?: string;
          object_key?: string;
          filename?: string;
          content_type?: string;
          byte_size?: number;
          status?: string;
          etag?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      griot_conversation_events: {
        Row: {
          id: string;
          conversation_id: string;
          message_id: string | null;
          workspace_id: string;
          event_type: string;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id: string;
          conversation_id: string;
          message_id?: string | null;
          workspace_id: string;
          event_type: string;
          payload: Json;
          created_at: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          message_id?: string | null;
          workspace_id?: string;
          event_type?: string;
          payload?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      griot_conversations: {
        Row: {
          id: string;
          workspace_id: string;
          project_id: string | null;
          title: string;
          created_by: string;
          created_at: string;
          updated_at: string;
          owner_id: string;
          visibility: string;
          training_opt_in: boolean;
          training_opted_in_by: string | null;
          training_opted_in_at: string | null;
          training_review_status: string;
          training_reviewed_by: string | null;
          training_reviewed_at: string | null;
        };
        Insert: {
          id: string;
          workspace_id: string;
          project_id?: string | null;
          title: string;
          created_by: string;
          created_at: string;
          updated_at: string;
          owner_id: string;
          visibility: string;
          training_opt_in: boolean;
          training_opted_in_by?: string | null;
          training_opted_in_at?: string | null;
          training_review_status: string;
          training_reviewed_by?: string | null;
          training_reviewed_at?: string | null;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          project_id?: string | null;
          title?: string;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          owner_id?: string;
          visibility?: string;
          training_opt_in?: boolean;
          training_opted_in_by?: string | null;
          training_opted_in_at?: string | null;
          training_review_status?: string;
          training_reviewed_by?: string | null;
          training_reviewed_at?: string | null;
        };
        Relationships: [];
      };
      griot_credential_secrets: {
        Row: {
          credential_id: string;
          secret_ciphertext: string;
          secret_iv: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          credential_id: string;
          secret_ciphertext: string;
          secret_iv: string;
          created_at: string;
          updated_at: string;
        };
        Update: {
          credential_id?: string;
          secret_ciphertext?: string;
          secret_iv?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      griot_credentials: {
        Row: {
          id: string;
          workspace_id: string;
          kind: string;
          provider_id: string;
          label: string;
          settings: Json;
          status: string;
          secret_hint: string;
          fingerprint: string;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          workspace_id: string;
          kind: string;
          provider_id: string;
          label: string;
          settings: Json;
          status: string;
          secret_hint: string;
          fingerprint: string;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          kind?: string;
          provider_id?: string;
          label?: string;
          settings?: Json;
          status?: string;
          secret_hint?: string;
          fingerprint?: string;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      griot_desktop_builds: {
        Row: {
          id: string;
          workspace_id: string;
          artifact_id: string;
          created_by: string;
          display_name: string;
          version: string;
          platform: string;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          workspace_id: string;
          artifact_id: string;
          created_by: string;
          display_name: string;
          version: string;
          platform: string;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          artifact_id?: string;
          created_by?: string;
          display_name?: string;
          version?: string;
          platform?: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      griot_fabric_approvals: {
        Row: {
          id: string;
          workspace_id: string;
          user_id: string;
          provider_id: string;
          action_id: string;
          input_sha256: string;
          reason: string;
          status: string;
          expires_at: string;
          consumed_at: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          workspace_id: string;
          user_id: string;
          provider_id: string;
          action_id: string;
          input_sha256: string;
          reason: string;
          status: string;
          expires_at: string;
          consumed_at?: string | null;
          created_at: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          user_id?: string;
          provider_id?: string;
          action_id?: string;
          input_sha256?: string;
          reason?: string;
          status?: string;
          expires_at?: string;
          consumed_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      griot_fabric_context_bindings: {
        Row: {
          id: string;
          workspace_id: string;
          name: string;
          provider_id: string;
          action_id: string;
          fixed_input: Json;
          audiences: Json;
          max_bytes: number;
          active: boolean;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          workspace_id: string;
          name: string;
          provider_id: string;
          action_id: string;
          fixed_input: Json;
          audiences: Json;
          max_bytes: number;
          active: boolean;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          name?: string;
          provider_id?: string;
          action_id?: string;
          fixed_input?: Json;
          audiences?: Json;
          max_bytes?: number;
          active?: boolean;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      griot_fabric_executions: {
        Row: {
          id: string;
          workspace_id: string;
          user_id: string;
          provider_id: string;
          action_id: string;
          effect: string;
          input_sha256: string;
          approval_id: string | null;
          status: string;
          provider_http_status: number | null;
          result_sha256: string | null;
          result_preview: Json | null;
          error_message: string | null;
          provider_request_id: string | null;
          duration_ms: number | null;
          metadata: Json;
          started_at: string;
          completed_at: string | null;
        };
        Insert: {
          id: string;
          workspace_id: string;
          user_id: string;
          provider_id: string;
          action_id: string;
          effect: string;
          input_sha256: string;
          approval_id?: string | null;
          status: string;
          provider_http_status?: number | null;
          result_sha256?: string | null;
          result_preview?: Json | null;
          error_message?: string | null;
          provider_request_id?: string | null;
          duration_ms?: number | null;
          metadata: Json;
          started_at: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          user_id?: string;
          provider_id?: string;
          action_id?: string;
          effect?: string;
          input_sha256?: string;
          approval_id?: string | null;
          status?: string;
          provider_http_status?: number | null;
          result_sha256?: string | null;
          result_preview?: Json | null;
          error_message?: string | null;
          provider_request_id?: string | null;
          duration_ms?: number | null;
          metadata?: Json;
          started_at?: string;
          completed_at?: string | null;
        };
        Relationships: [];
      };
      griot_gcu_calibrations: {
        Row: {
          version: string;
          status: string;
          effective_from: string;
          formula: Json;
          reason: string;
          created_at: string;
        };
        Insert: {
          version: string;
          status: string;
          effective_from: string;
          formula: Json;
          reason: string;
          created_at: string;
        };
        Update: {
          version?: string;
          status?: string;
          effective_from?: string;
          formula?: Json;
          reason?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      griot_gcu_executions: {
        Row: {
          id: string;
          workspace_id: string;
          project_id: string | null;
          user_id: string | null;
          idempotency_key: string;
          request_sha256: string;
          calibration_version: string;
          status: string;
          reserved_gcu: number;
          actual_gcu: number | null;
          unpaid_gcu: number;
          failure_class: string | null;
          metadata: Json;
          started_at: string;
          completed_at: string | null;
        };
        Insert: {
          id: string;
          workspace_id: string;
          project_id?: string | null;
          user_id?: string | null;
          idempotency_key: string;
          request_sha256: string;
          calibration_version: string;
          status: string;
          reserved_gcu: number;
          actual_gcu?: number | null;
          unpaid_gcu: number;
          failure_class?: string | null;
          metadata: Json;
          started_at: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          project_id?: string | null;
          user_id?: string | null;
          idempotency_key?: string;
          request_sha256?: string;
          calibration_version?: string;
          status?: string;
          reserved_gcu?: number;
          actual_gcu?: number | null;
          unpaid_gcu?: number;
          failure_class?: string | null;
          metadata?: Json;
          started_at?: string;
          completed_at?: string | null;
        };
        Relationships: [];
      };
      griot_gcu_ledger: {
        Row: {
          id: string;
          workspace_id: string;
          execution_id: string | null;
          event_type: string;
          amount_gcu: number;
          balance_delta_gcu: number;
          reserved_delta_gcu: number;
          debt_delta_gcu: number;
          idempotency_key: string;
          calibration_version: string | null;
          reason: string;
          source: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id: string;
          workspace_id: string;
          execution_id?: string | null;
          event_type: string;
          amount_gcu: number;
          balance_delta_gcu: number;
          reserved_delta_gcu: number;
          debt_delta_gcu: number;
          idempotency_key: string;
          calibration_version?: string | null;
          reason: string;
          source: string;
          metadata: Json;
          created_at: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          execution_id?: string | null;
          event_type?: string;
          amount_gcu?: number;
          balance_delta_gcu?: number;
          reserved_delta_gcu?: number;
          debt_delta_gcu?: number;
          idempotency_key?: string;
          calibration_version?: string | null;
          reason?: string;
          source?: string;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      griot_gcu_policies: {
        Row: {
          workspace_id: string;
          mode: string;
          monthly_limit_gcu: number | null;
          execution_limit_gcu: number | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          workspace_id: string;
          mode: string;
          monthly_limit_gcu?: number | null;
          execution_limit_gcu?: number | null;
          updated_by?: string | null;
          created_at: string;
          updated_at: string;
        };
        Update: {
          workspace_id?: string;
          mode?: string;
          monthly_limit_gcu?: number | null;
          execution_limit_gcu?: number | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      griot_gcu_usage: {
        Row: {
          id: string;
          execution_id: string;
          workspace_id: string;
          project_id: string | null;
          user_id: string | null;
          idempotency_key: string;
          scope_id: string;
          checkpoint_sequence: number;
          component: string;
          operation: string;
          hardware_class: string;
          resource_class: string;
          origin: string;
          metrics: Json;
          normalized_units: number;
          gcu_amount: number;
          duration_ms: number | null;
          metadata: Json;
          occurred_at: string;
        };
        Insert: {
          id: string;
          execution_id: string;
          workspace_id: string;
          project_id?: string | null;
          user_id?: string | null;
          idempotency_key: string;
          scope_id: string;
          checkpoint_sequence: number;
          component: string;
          operation: string;
          hardware_class: string;
          resource_class: string;
          origin: string;
          metrics: Json;
          normalized_units: number;
          gcu_amount: number;
          duration_ms?: number | null;
          metadata: Json;
          occurred_at: string;
        };
        Update: {
          id?: string;
          execution_id?: string;
          workspace_id?: string;
          project_id?: string | null;
          user_id?: string | null;
          idempotency_key?: string;
          scope_id?: string;
          checkpoint_sequence?: number;
          component?: string;
          operation?: string;
          hardware_class?: string;
          resource_class?: string;
          origin?: string;
          metrics?: Json;
          normalized_units?: number;
          gcu_amount?: number;
          duration_ms?: number | null;
          metadata?: Json;
          occurred_at?: string;
        };
        Relationships: [];
      };
      griot_gcu_wallets: {
        Row: {
          workspace_id: string;
          balance_gcu: number;
          reserved_gcu: number;
          debt_gcu: number;
          lifetime_used_gcu: number;
          version: number;
          updated_at: string;
        };
        Insert: {
          workspace_id: string;
          balance_gcu: number;
          reserved_gcu: number;
          debt_gcu: number;
          lifetime_used_gcu: number;
          version: number;
          updated_at: string;
        };
        Update: {
          workspace_id?: string;
          balance_gcu?: number;
          reserved_gcu?: number;
          debt_gcu?: number;
          lifetime_used_gcu?: number;
          version?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      griot_gpu_mission_events: {
        Row: {
          id: string;
          mission_id: string;
          sequence: number;
          event_type: string;
          wave: number;
          previous_hash: string;
          event_hash: string;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id: string;
          mission_id: string;
          sequence: number;
          event_type: string;
          wave: number;
          previous_hash: string;
          event_hash: string;
          payload: Json;
          created_at: string;
        };
        Update: {
          id?: string;
          mission_id?: string;
          sequence?: number;
          event_type?: string;
          wave?: number;
          previous_hash?: string;
          event_hash?: string;
          payload?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      griot_gpu_missions: {
        Row: {
          id: string;
          workspace_id: string;
          user_id: string;
          intent: string;
          status: string;
          current_wave: number;
          manifest: Json;
          certificate: Json | null;
          summary: string | null;
          cost_gcu: number;
          error_message: string | null;
          created_at: string;
          updated_at: string;
          completed_at: string | null;
        };
        Insert: {
          id: string;
          workspace_id: string;
          user_id: string;
          intent: string;
          status: string;
          current_wave: number;
          manifest: Json;
          certificate?: Json | null;
          summary?: string | null;
          cost_gcu: number;
          error_message?: string | null;
          created_at: string;
          updated_at: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          user_id?: string;
          intent?: string;
          status?: string;
          current_wave?: number;
          manifest?: Json;
          certificate?: Json | null;
          summary?: string | null;
          cost_gcu?: number;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
        };
        Relationships: [];
      };
      griot_messages: {
        Row: {
          id: string;
          conversation_id: string;
          workspace_id: string;
          actor_kind: string;
          status: string;
          content: string;
          metadata: Json;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          conversation_id: string;
          workspace_id: string;
          actor_kind: string;
          status: string;
          content: string;
          metadata: Json;
          error_message?: string | null;
          created_at: string;
          updated_at: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          workspace_id?: string;
          actor_kind?: string;
          status?: string;
          content?: string;
          metadata?: Json;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      griot_opb_context_receipts: {
        Row: {
          id: string;
          workspace_id: string;
          project_id: string | null;
          query: string;
          budget_chars: number;
          selected_sources: Json;
          context_text: string;
          compiled_sha256: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id: string;
          workspace_id: string;
          project_id?: string | null;
          query: string;
          budget_chars: number;
          selected_sources: Json;
          context_text: string;
          compiled_sha256: string;
          created_by: string;
          created_at: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          project_id?: string | null;
          query?: string;
          budget_chars?: number;
          selected_sources?: Json;
          context_text?: string;
          compiled_sha256?: string;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      griot_opb_edges: {
        Row: {
          id: string;
          workspace_id: string;
          project_id: string | null;
          source_id: string;
          edge_type: string;
          target_ref: string;
          target_source_id: string | null;
          weight: number;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id: string;
          workspace_id: string;
          project_id?: string | null;
          source_id: string;
          edge_type: string;
          target_ref: string;
          target_source_id?: string | null;
          weight: number;
          metadata: Json;
          created_at: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          project_id?: string | null;
          source_id?: string;
          edge_type?: string;
          target_ref?: string;
          target_source_id?: string | null;
          weight?: number;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      griot_opb_events: {
        Row: {
          id: string;
          workspace_id: string;
          project_id: string | null;
          source_id: string | null;
          actor_id: string | null;
          event_type: string;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          project_id?: string | null;
          source_id?: string | null;
          actor_id?: string | null;
          event_type: string;
          payload: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          project_id?: string | null;
          source_id?: string | null;
          actor_id?: string | null;
          event_type?: string;
          payload?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      griot_opb_memories: {
        Row: {
          id: string;
          workspace_id: string;
          project_id: string | null;
          memory_type: string;
          title: string;
          subject: string;
          statement: string;
          rationale: string;
          outcome: string;
          failure_reason: string;
          lesson: string;
          confidence: number;
          confidence_basis: string;
          status: string;
          supersedes_id: string | null;
          origin_type: string;
          origin_ref: string;
          revision: number;
          actor_id: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
          search_vector: string | null;
        };
        Insert: {
          id: string;
          workspace_id: string;
          project_id?: string | null;
          memory_type: string;
          title: string;
          subject: string;
          statement: string;
          rationale: string;
          outcome: string;
          failure_reason: string;
          lesson: string;
          confidence: number;
          confidence_basis: string;
          status: string;
          supersedes_id?: string | null;
          origin_type: string;
          origin_ref: string;
          revision: number;
          actor_id?: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
          search_vector?: string | null;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          project_id?: string | null;
          memory_type?: string;
          title?: string;
          subject?: string;
          statement?: string;
          rationale?: string;
          outcome?: string;
          failure_reason?: string;
          lesson?: string;
          confidence?: number;
          confidence_basis?: string;
          status?: string;
          supersedes_id?: string | null;
          origin_type?: string;
          origin_ref?: string;
          revision?: number;
          actor_id?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
          search_vector?: string | null;
        };
        Relationships: [];
      };
      griot_opb_memory_evidence: {
        Row: {
          memory_id: string;
          source_id: string;
          relation: string;
          weight: number;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          memory_id: string;
          source_id: string;
          relation: string;
          weight: number;
          metadata: Json;
          created_at: string;
        };
        Update: {
          memory_id?: string;
          source_id?: string;
          relation?: string;
          weight?: number;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      griot_opb_memory_links: {
        Row: {
          id: string;
          workspace_id: string;
          project_id: string;
          from_memory_id: string;
          to_memory_id: string;
          relation: string;
          weight: number;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id: string;
          workspace_id: string;
          project_id: string;
          from_memory_id: string;
          to_memory_id: string;
          relation: string;
          weight: number;
          metadata: Json;
          created_at: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          project_id?: string;
          from_memory_id?: string;
          to_memory_id?: string;
          relation?: string;
          weight?: number;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      griot_opb_project_state: {
        Row: {
          id: string;
          workspace_id: string;
          project_id: string;
          status: string;
          current_goal: string;
          summary: string;
          architecture: string;
          completed: Json;
          in_progress: Json;
          blocked: Json;
          risks: Json;
          open_decisions: Json;
          confidence: number;
          confidence_basis: string;
          revision: number;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          workspace_id: string;
          project_id: string;
          status: string;
          current_goal: string;
          summary: string;
          architecture: string;
          completed: Json;
          in_progress: Json;
          blocked: Json;
          risks: Json;
          open_decisions: Json;
          confidence: number;
          confidence_basis: string;
          revision: number;
          updated_by?: string | null;
          created_at: string;
          updated_at: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          project_id?: string;
          status?: string;
          current_goal?: string;
          summary?: string;
          architecture?: string;
          completed?: Json;
          in_progress?: Json;
          blocked?: Json;
          risks?: Json;
          open_decisions?: Json;
          confidence?: number;
          confidence_basis?: string;
          revision?: number;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      griot_opb_snapshots: {
        Row: {
          id: string;
          workspace_id: string;
          project_id: string | null;
          source_count: number;
          manifest: Json;
          root_sha256: string;
          created_by: string;
          created_at: string;
          label: string | null;
        };
        Insert: {
          id: string;
          workspace_id: string;
          project_id?: string | null;
          source_count: number;
          manifest: Json;
          root_sha256: string;
          created_by: string;
          created_at: string;
          label?: string | null;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          project_id?: string | null;
          source_count?: number;
          manifest?: Json;
          root_sha256?: string;
          created_by?: string;
          created_at?: string;
          label?: string | null;
        };
        Relationships: [];
      };
      griot_opb_sources: {
        Row: {
          id: string;
          workspace_id: string;
          project_id: string | null;
          source_type: string;
          source_ref: string;
          title: string;
          content: string;
          content_sha256: string;
          language: string | null;
          revision: number;
          status: string;
          metadata: Json;
          created_by: string;
          created_at: string;
          updated_at: string;
          search_vector: string | null;
        };
        Insert: {
          id: string;
          workspace_id: string;
          project_id?: string | null;
          source_type: string;
          source_ref: string;
          title: string;
          content: string;
          content_sha256: string;
          language?: string | null;
          revision: number;
          status: string;
          metadata: Json;
          created_by: string;
          created_at: string;
          updated_at: string;
          search_vector?: string | null;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          project_id?: string | null;
          source_type?: string;
          source_ref?: string;
          title?: string;
          content?: string;
          content_sha256?: string;
          language?: string | null;
          revision?: number;
          status?: string;
          metadata?: Json;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          search_vector?: string | null;
        };
        Relationships: [];
      };
      griot_opb_symbols: {
        Row: {
          id: string;
          workspace_id: string;
          project_id: string | null;
          source_id: string;
          kind: string;
          name: string;
          qualified_name: string | null;
          line_start: number | null;
          line_end: number | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id: string;
          workspace_id: string;
          project_id?: string | null;
          source_id: string;
          kind: string;
          name: string;
          qualified_name?: string | null;
          line_start?: number | null;
          line_end?: number | null;
          metadata: Json;
          created_at: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          project_id?: string | null;
          source_id?: string;
          kind?: string;
          name?: string;
          qualified_name?: string | null;
          line_start?: number | null;
          line_end?: number | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      griot_orchestrator_requests: {
        Row: {
          id: string;
          workspace_id: string;
          user_id: string;
          idempotency_key: string;
          request_sha256: string;
          status: string;
          conversation_id: string | null;
          human_message_id: string | null;
          model_message_id: string | null;
          provider_id: string;
          model_id: string;
          context_receipt_id: string | null;
          fabric_execution_ids: Json;
          error_message: string | null;
          metadata: Json;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id: string;
          workspace_id: string;
          user_id: string;
          idempotency_key: string;
          request_sha256: string;
          status: string;
          conversation_id?: string | null;
          human_message_id?: string | null;
          model_message_id?: string | null;
          provider_id: string;
          model_id: string;
          context_receipt_id?: string | null;
          fabric_execution_ids: Json;
          error_message?: string | null;
          metadata: Json;
          created_at: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          user_id?: string;
          idempotency_key?: string;
          request_sha256?: string;
          status?: string;
          conversation_id?: string | null;
          human_message_id?: string | null;
          model_message_id?: string | null;
          provider_id?: string;
          model_id?: string;
          context_receipt_id?: string | null;
          fabric_execution_ids?: Json;
          error_message?: string | null;
          metadata?: Json;
          created_at?: string;
          completed_at?: string | null;
        };
        Relationships: [];
      };
      griot_pipeline_configs: {
        Row: {
          workspace_id: string;
          created_by: string;
          version: number;
          nodes: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          workspace_id: string;
          created_by: string;
          version: number;
          nodes: Json;
          created_at: string;
          updated_at: string;
        };
        Update: {
          workspace_id?: string;
          created_by?: string;
          version?: number;
          nodes?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      griot_platform_admins: {
        Row: {
          user_id: string;
          active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          active: boolean;
          created_by?: string | null;
          created_at: string;
          updated_at: string;
        };
        Update: {
          user_id?: string;
          active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      griot_provider_usage_events: {
        Row: {
          id: string;
          workspace_id: string;
          user_id: string;
          conversation_id: string | null;
          request_id: string;
          provider_id: string;
          model_id: string;
          status: string;
          input_tokens: number | null;
          output_tokens: number | null;
          cached_input_tokens: number | null;
          reasoning_tokens: number | null;
          total_tokens: number | null;
          request_count: number;
          estimated_cost_usd: number | null;
          cost_confidence: string;
          usage_source: string;
          currency: string;
          error_message: string | null;
          metadata: Json;
          started_at: string;
          completed_at: string | null;
          occurred_at: string;
          created_at: string;
        };
        Insert: {
          id: string;
          workspace_id: string;
          user_id: string;
          conversation_id?: string | null;
          request_id: string;
          provider_id: string;
          model_id: string;
          status: string;
          input_tokens?: number | null;
          output_tokens?: number | null;
          cached_input_tokens?: number | null;
          reasoning_tokens?: number | null;
          total_tokens?: number | null;
          request_count: number;
          estimated_cost_usd?: number | null;
          cost_confidence: string;
          usage_source: string;
          currency: string;
          error_message?: string | null;
          metadata: Json;
          started_at: string;
          completed_at?: string | null;
          occurred_at: string;
          created_at: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          user_id?: string;
          conversation_id?: string | null;
          request_id?: string;
          provider_id?: string;
          model_id?: string;
          status?: string;
          input_tokens?: number | null;
          output_tokens?: number | null;
          cached_input_tokens?: number | null;
          reasoning_tokens?: number | null;
          total_tokens?: number | null;
          request_count?: number;
          estimated_cost_usd?: number | null;
          cost_confidence?: string;
          usage_source?: string;
          currency?: string;
          error_message?: string | null;
          metadata?: Json;
          started_at?: string;
          completed_at?: string | null;
          occurred_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      griot_provider_usage_policies: {
        Row: {
          workspace_id: string;
          provider_id: string;
          monthly_budget_usd: number | null;
          daily_request_limit: number | null;
          daily_token_limit: number | null;
          warning_percent: number;
          critical_percent: number;
          hard_stop_percent: number;
          auto_economy: boolean;
          paid_fallback_requires_approval: boolean;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          workspace_id: string;
          provider_id: string;
          monthly_budget_usd?: number | null;
          daily_request_limit?: number | null;
          daily_token_limit?: number | null;
          warning_percent: number;
          critical_percent: number;
          hard_stop_percent: number;
          auto_economy: boolean;
          paid_fallback_requires_approval: boolean;
          updated_by?: string | null;
          created_at: string;
          updated_at: string;
        };
        Update: {
          workspace_id?: string;
          provider_id?: string;
          monthly_budget_usd?: number | null;
          daily_request_limit?: number | null;
          daily_token_limit?: number | null;
          warning_percent?: number;
          critical_percent?: number;
          hard_stop_percent?: number;
          auto_economy?: boolean;
          paid_fallback_requires_approval?: boolean;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      griot_studio_agent_permissions: {
        Row: {
          workspace_id: string;
          project_id: string;
          user_id: string;
          full_access: boolean;
          updated_at: string;
        };
        Insert: {
          workspace_id: string;
          project_id: string;
          user_id: string;
          full_access: boolean;
          updated_at: string;
        };
        Update: {
          workspace_id?: string;
          project_id?: string;
          user_id?: string;
          full_access?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      griot_studio_compute_connections: {
        Row: {
          id: string;
          workspace_id: string;
          user_id: string;
          internal_connection_id: string;
          provider: string;
          label: string;
          status: string;
          provider_account_hint: string | null;
          capabilities: Json;
          last_verified_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          workspace_id: string;
          user_id: string;
          internal_connection_id: string;
          provider: string;
          label: string;
          status: string;
          provider_account_hint?: string | null;
          capabilities: Json;
          last_verified_at?: string | null;
          created_at: string;
          updated_at: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          user_id?: string;
          internal_connection_id?: string;
          provider?: string;
          label?: string;
          status?: string;
          provider_account_hint?: string | null;
          capabilities?: Json;
          last_verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      griot_studio_compute_runs: {
        Row: {
          id: string;
          workspace_id: string;
          project_id: string;
          user_id: string;
          internal_run_id: string;
          internal_task_id: string;
          runtime_id: string;
          connection_id: string;
          provider: string;
          repository_full_name: string;
          repository_ref: string;
          source_commit_sha: string;
          source_tree_sha: string;
          status: string;
          created_at: string;
          updated_at: string;
          finished_at: string | null;
        };
        Insert: {
          id: string;
          workspace_id: string;
          project_id: string;
          user_id: string;
          internal_run_id: string;
          internal_task_id: string;
          runtime_id: string;
          connection_id: string;
          provider: string;
          repository_full_name: string;
          repository_ref: string;
          source_commit_sha: string;
          source_tree_sha: string;
          status: string;
          created_at: string;
          updated_at: string;
          finished_at?: string | null;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          project_id?: string;
          user_id?: string;
          internal_run_id?: string;
          internal_task_id?: string;
          runtime_id?: string;
          connection_id?: string;
          provider?: string;
          repository_full_name?: string;
          repository_ref?: string;
          source_commit_sha?: string;
          source_tree_sha?: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
          finished_at?: string | null;
        };
        Relationships: [];
      };
      griot_studio_projects: {
        Row: {
          id: string;
          workspace_id: string;
          owner_id: string;
          name: string;
          description: string;
          brief: Json;
          created_at: string;
          updated_at: string;
          archived: boolean;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          owner_id: string;
          name: string;
          description?: string;
          brief?: Json;
          created_at?: string;
          updated_at?: string;
          archived?: boolean;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          owner_id?: string;
          name?: string;
          description?: string;
          brief?: Json;
          created_at?: string;
          updated_at?: string;
          archived?: boolean;
        };
        Relationships: [];
      };
      griot_studio_repository_bindings: {
        Row: {
          id: string;
          workspace_id: string;
          project_id: string;
          credential_id: string;
          provider: string;
          repository_id: number;
          repository_owner: string;
          repository_name: string;
          repository_full_name: string;
          ref: string;
          default_branch: string;
          binding_sha256: string;
          metadata_execution_id: string;
          ref_execution_id: string;
          metadata_result_sha256: string;
          ref_result_sha256: string;
          status: string;
          verified_by: string;
          verified_at: string;
          revoked_at: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          workspace_id: string;
          project_id: string;
          credential_id: string;
          provider: string;
          repository_id: number;
          repository_owner: string;
          repository_name: string;
          repository_full_name: string;
          ref: string;
          default_branch: string;
          binding_sha256: string;
          metadata_execution_id: string;
          ref_execution_id: string;
          metadata_result_sha256: string;
          ref_result_sha256: string;
          status: string;
          verified_by: string;
          verified_at: string;
          revoked_at?: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          project_id?: string;
          credential_id?: string;
          provider?: string;
          repository_id?: number;
          repository_owner?: string;
          repository_name?: string;
          repository_full_name?: string;
          ref?: string;
          default_branch?: string;
          binding_sha256?: string;
          metadata_execution_id?: string;
          ref_execution_id?: string;
          metadata_result_sha256?: string;
          ref_result_sha256?: string;
          status?: string;
          verified_by?: string;
          verified_at?: string;
          revoked_at?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      griot_studio_runtimes: {
        Row: {
          id: string;
          workspace_id: string;
          project_id: string;
          connection_id: string;
          user_id: string;
          provider: string;
          runtime_key: string;
          status: string;
          capabilities: Json;
          resource_class: string | null;
          metadata: Json;
          created_at: string;
          last_active_at: string | null;
          expires_at: string | null;
          destroyed_at: string | null;
          updated_at: string;
        };
        Insert: {
          id: string;
          workspace_id: string;
          project_id: string;
          connection_id: string;
          user_id: string;
          provider: string;
          runtime_key: string;
          status: string;
          capabilities: Json;
          resource_class?: string | null;
          metadata: Json;
          created_at: string;
          last_active_at?: string | null;
          expires_at?: string | null;
          destroyed_at?: string | null;
          updated_at: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          project_id?: string;
          connection_id?: string;
          user_id?: string;
          provider?: string;
          runtime_key?: string;
          status?: string;
          capabilities?: Json;
          resource_class?: string | null;
          metadata?: Json;
          created_at?: string;
          last_active_at?: string | null;
          expires_at?: string | null;
          destroyed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      griot_studio_tasks: {
        Row: {
          id: string;
          workspace_id: string;
          project_id: string;
          created_by: string;
          title: string;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          workspace_id: string;
          project_id: string;
          created_by: string;
          title: string;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          project_id?: string;
          created_by?: string;
          title?: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      griot_user_profiles: {
        Row: {
          id: string;
          display_name: string;
          created_at: string;
          updated_at: string;
          avatar_url: string | null;
        };
        Insert: {
          id: string;
          display_name: string;
          created_at: string;
          updated_at: string;
          avatar_url?: string | null;
        };
        Update: {
          id?: string;
          display_name?: string;
          created_at?: string;
          updated_at?: string;
          avatar_url?: string | null;
        };
        Relationships: [];
      };
      griot_workspace_members: {
        Row: {
          workspace_id: string;
          user_id: string;
          role: string;
          created_at: string;
        };
        Insert: {
          workspace_id: string;
          user_id: string;
          role: string;
          created_at: string;
        };
        Update: {
          workspace_id?: string;
          user_id?: string;
          role?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      griot_workspaces: {
        Row: {
          id: string;
          name: string;
          slug: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name: string;
          slug: string;
          created_at: string;
          updated_at: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      griot_can_read_conversation: {
        Args: {
          target_conversation: string;
          target_workspace: string;
        };
        Returns: Json;
      };
      griot_fabric_consume_approval: {
        Args: {
          p_action_id: string;
          p_approval_id: string;
          p_input_sha256: string;
          p_provider_id: string;
          p_user_id: string;
          p_workspace_id: string;
        };
        Returns: Json;
      };
      griot_gcu_grant: {
        Args: {
          p_actor_id: string;
          p_amount: number;
          p_idempotency_key: string;
          p_reason: string;
          p_source: string;
          p_workspace_id: string;
        };
        Returns: Json;
      };
      griot_gcu_meter_event: {
        Args: {
          p_component: string;
          p_duration_ms?: number;
          p_idempotency_key: string;
          p_metadata?: Json;
          p_metrics: Json;
          p_operation: string;
          p_project_id?: string;
          p_user_id: string;
          p_workspace_id: string;
        };
        Returns: Json;
      };
      griot_gcu_refund: {
        Args: {
          p_actor_id: string;
          p_amount: number;
          p_execution_id: string;
          p_idempotency_key: string;
          p_reason: string;
          p_workspace_id: string;
        };
        Returns: Json;
      };
      griot_gcu_service_debt: {
        Args: {
          p_idempotency_prefix: string;
          p_reason: string;
          p_workspace_id: string;
        };
        Returns: Json;
      };
      griot_is_member: {
        Args: {
          target_workspace: string;
        };
        Returns: Json;
      };
      griot_is_platform_admin: {
        Args: {
        };
        Returns: Json;
      };
      griot_is_workspace_admin: {
        Args: {
          target_workspace: string;
        };
        Returns: Json;
      };
      griot_opb_memory_context: {
        Args: {
          p_limit?: number;
          p_project_id: string;
          p_query?: string;
          p_workspace_id: string;
        };
        Returns: Json;
      };
      griot_opb_memory_context_graph: {
        Args: {
          p_limit?: number;
          p_project_id: string;
          p_query: string;
          p_related_limit?: number;
          p_workspace_id: string;
        };
        Returns: Json;
      };
      griot_opb_record_memory: {
        Args: {
          p_actor_id?: string;
          p_confidence?: number;
          p_confidence_basis?: string;
          p_evidence?: Json;
          p_failure_reason?: string;
          p_lesson?: string;
          p_memory_type: string;
          p_metadata?: Json;
          p_origin_ref?: string;
          p_origin_type?: string;
          p_outcome?: string;
          p_project_id: string;
          p_rationale?: string;
          p_statement: string;
          p_status?: string;
          p_subject: string;
          p_supersedes_id?: string;
          p_title: string;
          p_workspace_id: string;
        };
        Returns: Json;
      };
      griot_opb_search: {
        Args: {
          p_excerpt_chars?: number;
          p_limit?: number;
          p_project_id?: string;
          p_query: string;
          p_workspace_id: string;
        };
        Returns: Json;
      };
      griot_opb_set_project_state: {
        Args: {
          p_architecture?: string;
          p_blocked?: Json;
          p_completed?: Json;
          p_confidence?: number;
          p_confidence_basis?: string;
          p_current_goal?: string;
          p_in_progress?: Json;
          p_open_decisions?: Json;
          p_project_id: string;
          p_risks?: Json;
          p_status: string;
          p_summary?: string;
          p_updated_by?: string;
          p_workspace_id: string;
        };
        Returns: Json;
      };
      griot_opb_upsert_source: {
        Args: {
          p_content: string;
          p_content_sha256: string;
          p_created_by: string;
          p_edges: Json;
          p_language: string;
          p_metadata: Json;
          p_project_id: string;
          p_source_ref: string;
          p_source_type: string;
          p_symbols: Json;
          p_title: string;
          p_workspace_id: string;
        };
        Returns: Json;
      };
      griot_publish_desktop_build: {
        Args: {
          p_artifact_id: string;
          p_display_name: string;
          p_version: string;
          p_workspace_id: string;
        };
        Returns: Json;
      };
      griot_studio_bind_repository: {
        Args: {
          p_binding_sha256: string;
          p_credential_id: string;
          p_default_branch: string;
          p_metadata?: Json;
          p_metadata_execution_id: string;
          p_metadata_result_sha256: string;
          p_project_id: string;
          p_ref: string;
          p_ref_execution_id: string;
          p_ref_result_sha256: string;
          p_repository_full_name: string;
          p_repository_id: number;
          p_repository_name: string;
          p_repository_owner: string;
          p_verified_by: string;
          p_workspace_id: string;
        };
        Returns: Json;
      };
      griot_studio_unbind_repository: {
        Args: {
          p_actor_id: string;
          p_project_id: string;
          p_workspace_id: string;
        };
        Returns: Json;
      };
      griot_workspace_admin: {
        Args: {
          target_workspace: string;
        };
        Returns: Json;
      };
      griot_workspace_member: {
        Args: {
          target_workspace: string;
        };
        Returns: Json;
      };
      match_similar_incidents: {
        Args: {
          filter_agent_id?: string;
          match_count?: number;
          match_threshold?: number;
          query_embedding: string;
        };
        Returns: Json;
      };
      rls_auto_enable: {
        Args: {
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
