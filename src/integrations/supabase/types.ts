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
      owns_merchant: { Args: { _merchant_id: string }; Returns: boolean }
      owns_product: { Args: { _product_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "merchant" | "admin" | "demo_buyer"
      entity_status: "active" | "inactive"
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
      app_role: ["merchant", "admin", "demo_buyer"],
      entity_status: ["active", "inactive"],
      relation_type: ["upsell", "cross_sell", "alternative"],
    },
  },
} as const
