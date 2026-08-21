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
      agent_runs: {
        Row: {
          completed_at: string | null
          completion_tokens: number | null
          created_at: string
          duration_ms: number | null
          error: string | null
          gateway_run_id: string | null
          id: string
          model: string
          prompt_tokens: number | null
          session_id: string
          started_at: string
          status: Database["public"]["Enums"]["agent_status"]
          step_count: number
          stop_reason: string | null
          tool_call_count: number
          total_tokens: number | null
          user_request: string | null
        }
        Insert: {
          completed_at?: string | null
          completion_tokens?: number | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          gateway_run_id?: string | null
          id?: string
          model: string
          prompt_tokens?: number | null
          session_id: string
          started_at?: string
          status?: Database["public"]["Enums"]["agent_status"]
          step_count?: number
          stop_reason?: string | null
          tool_call_count?: number
          total_tokens?: number | null
          user_request?: string | null
        }
        Update: {
          completed_at?: string | null
          completion_tokens?: number | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          gateway_run_id?: string | null
          id?: string
          model?: string
          prompt_tokens?: number | null
          session_id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["agent_status"]
          step_count?: number
          stop_reason?: string | null
          tool_call_count?: number
          total_tokens?: number | null
          user_request?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          merchant_id: string
          started_at: string
          status: Database["public"]["Enums"]["agent_status"]
          title: string | null
          user_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          merchant_id: string
          started_at?: string
          status?: Database["public"]["Enums"]["agent_status"]
          title?: string | null
          user_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          merchant_id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["agent_status"]
          title?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_sessions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_steps: {
        Row: {
          created_at: string
          id: string
          input_summary: string | null
          latency_ms: number | null
          output_summary: string | null
          run_id: string
          status: string
          step_number: number
          step_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          input_summary?: string | null
          latency_ms?: number | null
          output_summary?: string | null
          run_id: string
          status?: string
          step_number: number
          step_type: string
        }
        Update: {
          created_at?: string
          id?: string
          input_summary?: string | null
          latency_ms?: number | null
          output_summary?: string | null
          run_id?: string
          status?: string
          step_number?: number
          step_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_steps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      api_request_logs: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          latency_ms: number
          merchant_id: string | null
          method: string
          status_code: number
          success: boolean
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          latency_ms: number
          merchant_id?: string | null
          method: string
          status_code: number
          success: boolean
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          latency_ms?: number
          merchant_id?: string | null
          method?: string
          status_code?: number
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "api_request_logs_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_approvals: {
        Row: {
          created_at: string
          id: string
          merchant_id: string
          order_id: string
          reason: string | null
          rejection_reason: string | null
          requested_at: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["approval_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          merchant_id: string
          order_id: string
          reason?: string | null
          rejection_reason?: string | null
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          merchant_id?: string
          order_id?: string
          reason?: string | null
          rejection_reason?: string | null
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkout_approvals_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_approvals_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_audit_events: {
        Row: {
          actor_id: string | null
          actor_type: Database["public"]["Enums"]["audit_actor_type"]
          buyer_session_id: string | null
          created_at: string
          event: Database["public"]["Enums"]["checkout_event"]
          from_status: Database["public"]["Enums"]["checkout_status"] | null
          id: string
          merchant_id: string
          order_id: string | null
          policy_decision: Json
          reason: string | null
          to_status: Database["public"]["Enums"]["checkout_status"] | null
        }
        Insert: {
          actor_id?: string | null
          actor_type: Database["public"]["Enums"]["audit_actor_type"]
          buyer_session_id?: string | null
          created_at?: string
          event: Database["public"]["Enums"]["checkout_event"]
          from_status?: Database["public"]["Enums"]["checkout_status"] | null
          id?: string
          merchant_id: string
          order_id?: string | null
          policy_decision?: Json
          reason?: string | null
          to_status?: Database["public"]["Enums"]["checkout_status"] | null
        }
        Update: {
          actor_id?: string | null
          actor_type?: Database["public"]["Enums"]["audit_actor_type"]
          buyer_session_id?: string | null
          created_at?: string
          event?: Database["public"]["Enums"]["checkout_event"]
          from_status?: Database["public"]["Enums"]["checkout_status"] | null
          id?: string
          merchant_id?: string
          order_id?: string | null
          policy_decision?: Json
          reason?: string | null
          to_status?: Database["public"]["Enums"]["checkout_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "checkout_audit_events_buyer_session_id_fkey"
            columns: ["buyer_session_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_audit_events_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_audit_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      growth_recommendations: {
        Row: {
          accepted: boolean
          accepted_at: string | null
          buyer_session_id: string
          created_at: string
          currency: string
          id: string
          merchant_id: string
          reason: string | null
          recommendation_type: Database["public"]["Enums"]["recommendation_type"]
          recommended_price: number
          recommended_product_id: string
          source_product_id: string
        }
        Insert: {
          accepted?: boolean
          accepted_at?: string | null
          buyer_session_id: string
          created_at?: string
          currency?: string
          id?: string
          merchant_id: string
          reason?: string | null
          recommendation_type: Database["public"]["Enums"]["recommendation_type"]
          recommended_price?: number
          recommended_product_id: string
          source_product_id: string
        }
        Update: {
          accepted?: boolean
          accepted_at?: string | null
          buyer_session_id?: string
          created_at?: string
          currency?: string
          id?: string
          merchant_id?: string
          reason?: string | null
          recommendation_type?: Database["public"]["Enums"]["recommendation_type"]
          recommended_price?: number
          recommended_product_id?: string
          source_product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "growth_recommendations_buyer_session_id_fkey"
            columns: ["buyer_session_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "growth_recommendations_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "growth_recommendations_recommended_product_id_fkey"
            columns: ["recommended_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "growth_recommendations_source_product_id_fkey"
            columns: ["source_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_policies: {
        Row: {
          allow_negotiation: boolean
          allow_upsell: boolean
          approval_required_above: number
          created_at: string
          id: string
          max_discount_percent: number
          max_order_value: number
          merchant_id: string
          updated_at: string
        }
        Insert: {
          allow_negotiation?: boolean
          allow_upsell?: boolean
          approval_required_above?: number
          created_at?: string
          id?: string
          max_discount_percent?: number
          max_order_value?: number
          merchant_id: string
          updated_at?: string
        }
        Update: {
          allow_negotiation?: boolean
          allow_upsell?: boolean
          approval_required_above?: number
          created_at?: string
          id?: string
          max_discount_percent?: number
          max_order_value?: number
          merchant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_policies_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: true
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      merchants: {
        Row: {
          agent_commerce_enabled: boolean
          created_at: string
          currency: string
          description: string | null
          id: string
          name: string
          owner_id: string
          slug: string | null
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
        }
        Insert: {
          agent_commerce_enabled?: boolean
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          name: string
          owner_id: string
          slug?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Update: {
          agent_commerce_enabled?: boolean
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          name?: string
          owner_id?: string
          slug?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Relationships: []
      }
      negotiation_rounds: {
        Row: {
          allowed_discount_percent: number
          created_at: string
          customer_request_summary: string | null
          id: string
          latency_ms: number | null
          policy_decision: Database["public"]["Enums"]["policy_decision"]
          policy_reason: string | null
          proposed_discount_percent: number
          quote_id: string | null
          requested_discount_percent: number
          response_summary: string | null
          round_number: number
          session_id: string
        }
        Insert: {
          allowed_discount_percent?: number
          created_at?: string
          customer_request_summary?: string | null
          id?: string
          latency_ms?: number | null
          policy_decision: Database["public"]["Enums"]["policy_decision"]
          policy_reason?: string | null
          proposed_discount_percent?: number
          quote_id?: string | null
          requested_discount_percent?: number
          response_summary?: string | null
          round_number: number
          session_id: string
        }
        Update: {
          allowed_discount_percent?: number
          created_at?: string
          customer_request_summary?: string | null
          id?: string
          latency_ms?: number | null
          policy_decision?: Database["public"]["Enums"]["policy_decision"]
          policy_reason?: string | null
          proposed_discount_percent?: number
          quote_id?: string | null
          requested_discount_percent?: number
          response_summary?: string | null
          round_number?: number
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "negotiation_rounds_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negotiation_rounds_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "negotiation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      negotiation_sessions: {
        Row: {
          buyer_session_id: string
          created_at: string
          id: string
          merchant_id: string
          product_id: string
          round_count: number
          status: Database["public"]["Enums"]["negotiation_status"]
          updated_at: string
        }
        Insert: {
          buyer_session_id: string
          created_at?: string
          id?: string
          merchant_id: string
          product_id: string
          round_count?: number
          status?: Database["public"]["Enums"]["negotiation_status"]
          updated_at?: string
        }
        Update: {
          buyer_session_id?: string
          created_at?: string
          id?: string
          merchant_id?: string
          product_id?: string
          round_count?: number
          status?: Database["public"]["Enums"]["negotiation_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "negotiation_sessions_buyer_session_id_fkey"
            columns: ["buyer_session_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negotiation_sessions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "negotiation_sessions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          approved_discount_percent: number
          base_amount: number
          created_at: string
          currency: string
          discount_amount: number
          expires_at: string
          final_amount: number
          id: string
          negotiation_session_id: string
          product_id: string
          quantity: number
          quote_id: string | null
          requested_discount_percent: number
          requires_merchant_approval: boolean
          status: Database["public"]["Enums"]["offer_status"]
          unit_price: number
        }
        Insert: {
          approved_discount_percent?: number
          base_amount: number
          created_at?: string
          currency: string
          discount_amount?: number
          expires_at: string
          final_amount: number
          id?: string
          negotiation_session_id: string
          product_id: string
          quantity: number
          quote_id?: string | null
          requested_discount_percent?: number
          requires_merchant_approval?: boolean
          status?: Database["public"]["Enums"]["offer_status"]
          unit_price: number
        }
        Update: {
          approved_discount_percent?: number
          base_amount?: number
          created_at?: string
          currency?: string
          discount_amount?: number
          expires_at?: string
          final_amount?: number
          id?: string
          negotiation_session_id?: string
          product_id?: string
          quantity?: number
          quote_id?: string | null
          requested_discount_percent?: number
          requires_merchant_approval?: boolean
          status?: Database["public"]["Enums"]["offer_status"]
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "offers_negotiation_session_id_fkey"
            columns: ["negotiation_session_id"]
            isOneToOne: false
            referencedRelation: "negotiation_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          discount_amount: number
          final_unit_price: number
          id: string
          order_id: string
          product_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          discount_amount?: number
          final_unit_price: number
          id?: string
          order_id: string
          product_id: string
          quantity: number
          unit_price: number
        }
        Update: {
          created_at?: string
          discount_amount?: number
          final_unit_price?: number
          id?: string
          order_id?: string
          product_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          approval_reason: string | null
          approval_required: boolean
          approved_at: string | null
          approved_by: string | null
          buyer_session_id: string
          created_at: string
          currency: string
          customer_request_summary: string | null
          discount_amount: number
          expires_at: string
          final_amount: number
          id: string
          idempotency_key: string
          merchant_id: string
          negotiation_summary: string | null
          policy_snapshot: Json
          quote_id: string
          rejected_at: string | null
          status: Database["public"]["Enums"]["checkout_status"]
          subtotal_amount: number
          updated_at: string
        }
        Insert: {
          approval_reason?: string | null
          approval_required?: boolean
          approved_at?: string | null
          approved_by?: string | null
          buyer_session_id: string
          created_at?: string
          currency?: string
          customer_request_summary?: string | null
          discount_amount?: number
          expires_at?: string
          final_amount: number
          id?: string
          idempotency_key: string
          merchant_id: string
          negotiation_summary?: string | null
          policy_snapshot?: Json
          quote_id: string
          rejected_at?: string | null
          status?: Database["public"]["Enums"]["checkout_status"]
          subtotal_amount: number
          updated_at?: string
        }
        Update: {
          approval_reason?: string | null
          approval_required?: boolean
          approved_at?: string | null
          approved_by?: string | null
          buyer_session_id?: string
          created_at?: string
          currency?: string
          customer_request_summary?: string | null
          discount_amount?: number
          expires_at?: string
          final_amount?: number
          id?: string
          idempotency_key?: string
          merchant_id?: string
          negotiation_summary?: string | null
          policy_snapshot?: Json
          quote_id?: string
          rejected_at?: string | null
          status?: Database["public"]["Enums"]["checkout_status"]
          subtotal_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_buyer_session_id_fkey"
            columns: ["buyer_session_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      product_relations: {
        Row: {
          created_at: string
          id: string
          priority: number
          product_id: string
          related_product_id: string
          relation_type: Database["public"]["Enums"]["relation_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          priority?: number
          product_id: string
          related_product_id: string
          relation_type: Database["public"]["Enums"]["relation_type"]
        }
        Update: {
          created_at?: string
          id?: string
          priority?: number
          product_id?: string
          related_product_id?: string
          relation_type?: Database["public"]["Enums"]["relation_type"]
        }
        Relationships: [
          {
            foreignKeyName: "product_relations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_relations_related_product_id_fkey"
            columns: ["related_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string | null
          created_at: string
          currency: string
          description: string | null
          id: string
          merchant_id: string
          metadata: Json
          name: string
          price: number
          status: Database["public"]["Enums"]["entity_status"]
          stock_quantity: number
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          merchant_id: string
          metadata?: Json
          name: string
          price?: number
          status?: Database["public"]["Enums"]["entity_status"]
          stock_quantity?: number
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          merchant_id?: string
          metadata?: Json
          name?: string
          price?: number
          status?: Database["public"]["Enums"]["entity_status"]
          stock_quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      quotes: {
        Row: {
          allowed_discount_percent: number
          base_amount: number
          created_at: string
          currency: string
          expires_at: string
          final_amount: number
          id: string
          merchant_id: string
          policy_applied: boolean
          policy_reason: string | null
          product_id: string
          quantity: number
          requested_discount_percent: number
          unit_price: number
        }
        Insert: {
          allowed_discount_percent?: number
          base_amount: number
          created_at?: string
          currency: string
          expires_at: string
          final_amount: number
          id?: string
          merchant_id: string
          policy_applied?: boolean
          policy_reason?: string | null
          product_id: string
          quantity: number
          requested_discount_percent?: number
          unit_price: number
        }
        Update: {
          allowed_discount_percent?: number
          base_amount?: number
          created_at?: string
          currency?: string
          expires_at?: string
          final_amount?: number
          id?: string
          merchant_id?: string
          policy_applied?: boolean
          policy_reason?: string | null
          product_id?: string
          quantity?: number
          requested_discount_percent?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotes_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_calls: {
        Row: {
          created_at: string
          error: string | null
          id: string
          input_json: Json | null
          latency_ms: number | null
          output_json: Json | null
          run_id: string
          status: string
          step_id: string | null
          tool_name: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          input_json?: Json | null
          latency_ms?: number | null
          output_json?: Json | null
          run_id: string
          status?: string
          step_id?: string | null
          tool_name: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          input_json?: Json | null
          latency_ms?: number | null
          output_json?: Json | null
          run_id?: string
          status?: string
          step_id?: string | null
          tool_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_calls_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_calls_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "agent_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bootstrap_current_user: {
        Args: { _full_name?: string; _store_name?: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      owns_agent_session: { Args: { _session_id: string }; Returns: boolean }
      owns_merchant: { Args: { _merchant_id: string }; Returns: boolean }
      owns_product: { Args: { _product_id: string }; Returns: boolean }
    }
    Enums: {
      agent_status: "running" | "completed" | "failed" | "stopped"
      app_role: "merchant" | "admin" | "demo_buyer"
      approval_status: "pending" | "approved" | "rejected"
      audit_actor_type: "ai_agent" | "merchant" | "system" | "buyer"
      checkout_event:
        | "CHECKOUT_REQUESTED"
        | "APPROVAL_REQUIRED"
        | "APPROVED"
        | "REJECTED"
        | "ORDER_CREATED"
        | "PAYMENT_PENDING"
        | "CHECKOUT_FAILED"
        | "CANCELLED"
        | "EXPIRED"
      checkout_status:
        | "QUOTE_CREATED"
        | "CHECKOUT_REQUESTED"
        | "APPROVAL_REQUIRED"
        | "APPROVED"
        | "REJECTED"
        | "ORDER_CREATED"
        | "PAYMENT_PENDING"
        | "CANCELLED"
        | "EXPIRED"
      entity_status: "active" | "inactive"
      negotiation_status: "open" | "agreed" | "rejected" | "expired" | "closed"
      offer_status: "proposed" | "accepted" | "rejected" | "expired"
      policy_decision: "accept" | "counter" | "reject"
      recommendation_type: "upsell" | "cross_sell"
      relation_type: "upsell" | "cross_sell" | "alternative"
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
      agent_status: ["running", "completed", "failed", "stopped"],
      app_role: ["merchant", "admin", "demo_buyer"],
      approval_status: ["pending", "approved", "rejected"],
      audit_actor_type: ["ai_agent", "merchant", "system", "buyer"],
      checkout_event: [
        "CHECKOUT_REQUESTED",
        "APPROVAL_REQUIRED",
        "APPROVED",
        "REJECTED",
        "ORDER_CREATED",
        "PAYMENT_PENDING",
        "CHECKOUT_FAILED",
        "CANCELLED",
        "EXPIRED",
      ],
      checkout_status: [
        "QUOTE_CREATED",
        "CHECKOUT_REQUESTED",
        "APPROVAL_REQUIRED",
        "APPROVED",
        "REJECTED",
        "ORDER_CREATED",
        "PAYMENT_PENDING",
        "CANCELLED",
        "EXPIRED",
      ],
      entity_status: ["active", "inactive"],
      negotiation_status: ["open", "agreed", "rejected", "expired", "closed"],
      offer_status: ["proposed", "accepted", "rejected", "expired"],
      policy_decision: ["accept", "counter", "reject"],
      recommendation_type: ["upsell", "cross_sell"],
      relation_type: ["upsell", "cross_sell", "alternative"],
    },
  },
} as const
