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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      assets: {
        Row: {
          asset_type: string | null
          avg_volume: number | null
          beta: number | null
          country: string | null
          created_at: string | null
          current_price: number | null
          dividend_yield: number | null
          eps: number | null
          exchange: string | null
          high_52w: number | null
          id: string
          industry: string | null
          logo_url: string | null
          low_52w: number | null
          market_cap: number | null
          name: string
          pe_ratio: number | null
          price_change: number | null
          price_change_pct: number | null
          sector: string | null
          symbol: string
          updated_at: string | null
        }
        Insert: {
          asset_type?: string | null
          avg_volume?: number | null
          beta?: number | null
          country?: string | null
          created_at?: string | null
          current_price?: number | null
          dividend_yield?: number | null
          eps?: number | null
          exchange?: string | null
          high_52w?: number | null
          id?: string
          industry?: string | null
          logo_url?: string | null
          low_52w?: number | null
          market_cap?: number | null
          name: string
          pe_ratio?: number | null
          price_change?: number | null
          price_change_pct?: number | null
          sector?: string | null
          symbol: string
          updated_at?: string | null
        }
        Update: {
          asset_type?: string | null
          avg_volume?: number | null
          beta?: number | null
          country?: string | null
          created_at?: string | null
          current_price?: number | null
          dividend_yield?: number | null
          eps?: number | null
          exchange?: string | null
          high_52w?: number | null
          id?: string
          industry?: string | null
          logo_url?: string | null
          low_52w?: number | null
          market_cap?: number | null
          name?: string
          pe_ratio?: number | null
          price_change?: number | null
          price_change_pct?: number | null
          sector?: string | null
          symbol?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      daily_movers: {
        Row: {
          ai_summary: string | null
          asset_id: string | null
          change_pct: number | null
          created_at: string | null
          date: string
          direction: string | null
          id: string
          top_traders_trading: string[] | null
          volume: number | null
        }
        Insert: {
          ai_summary?: string | null
          asset_id?: string | null
          change_pct?: number | null
          created_at?: string | null
          date?: string
          direction?: string | null
          id?: string
          top_traders_trading?: string[] | null
          volume?: number | null
        }
        Update: {
          ai_summary?: string | null
          asset_id?: string | null
          change_pct?: number | null
          created_at?: string | null
          date?: string
          direction?: string | null
          id?: string
          top_traders_trading?: string[] | null
          volume?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_movers_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      data_discrepancies: {
        Row: {
          bullaware_value: string | null
          created_at: string
          difference_pct: number | null
          entity_id: string
          entity_name: string
          entity_type: string
          field_name: string
          firecrawl_value: string | null
          id: string
          notes: string | null
          reviewed_at: string | null
          status: string
          value_used: string
        }
        Insert: {
          bullaware_value?: string | null
          created_at?: string
          difference_pct?: number | null
          entity_id: string
          entity_name: string
          entity_type: string
          field_name: string
          firecrawl_value?: string | null
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          status?: string
          value_used?: string
        }
        Update: {
          bullaware_value?: string | null
          created_at?: string
          difference_pct?: number | null
          entity_id?: string
          entity_name?: string
          entity_type?: string
          field_name?: string
          firecrawl_value?: string | null
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          status?: string
          value_used?: string
        }
        Relationships: []
      }
      posts: {
        Row: {
          asset_ids: string[] | null
          comments: number | null
          content: string
          created_at: string | null
          etoro_post_id: string | null
          id: string
          likes: number | null
          mentioned_symbols: string[] | null
          posted_at: string | null
          sentiment: string | null
          shares: number | null
          source: string | null
          trader_id: string | null
        }
        Insert: {
          asset_ids?: string[] | null
          comments?: number | null
          content: string
          created_at?: string | null
          etoro_post_id?: string | null
          id?: string
          likes?: number | null
          mentioned_symbols?: string[] | null
          posted_at?: string | null
          sentiment?: string | null
          shares?: number | null
          source?: string | null
          trader_id?: string | null
        }
        Update: {
          asset_ids?: string[] | null
          comments?: number | null
          content?: string
          created_at?: string | null
          etoro_post_id?: string | null
          id?: string
          likes?: number | null
          mentioned_symbols?: string[] | null
          posted_at?: string | null
          sentiment?: string | null
          shares?: number | null
          source?: string | null
          trader_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_trader_id_fkey"
            columns: ["trader_id"]
            isOneToOne: false
            referencedRelation: "traders"
            referencedColumns: ["id"]
          },
        ]
      }
      price_history: {
        Row: {
          asset_id: string | null
          close_price: number | null
          created_at: string | null
          date: string
          high_price: number | null
          id: string
          low_price: number | null
          open_price: number | null
          volume: number | null
        }
        Insert: {
          asset_id?: string | null
          close_price?: number | null
          created_at?: string | null
          date: string
          high_price?: number | null
          id?: string
          low_price?: number | null
          open_price?: number | null
          volume?: number | null
        }
        Update: {
          asset_id?: string | null
          close_price?: number | null
          created_at?: string | null
          date?: string
          high_price?: number | null
          id?: string
          low_price?: number | null
          open_price?: number | null
          volume?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "price_history_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          ai_generated: boolean | null
          asset_id: string | null
          content: string | null
          created_at: string | null
          created_by: string | null
          horizon: string | null
          id: string
          input_assets: string[] | null
          input_trader_ids: string[] | null
          rating: string | null
          raw_response: string | null
          report_type: string | null
          score_12m: number | null
          score_6m: number | null
          score_long_term: number | null
          starred_for_ic: boolean | null
          status: string | null
          summary: string | null
          title: string
          trader_id: string | null
          updated_at: string | null
          upside_pct_estimate: number | null
        }
        Insert: {
          ai_generated?: boolean | null
          asset_id?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          horizon?: string | null
          id?: string
          input_assets?: string[] | null
          input_trader_ids?: string[] | null
          rating?: string | null
          raw_response?: string | null
          report_type?: string | null
          score_12m?: number | null
          score_6m?: number | null
          score_long_term?: number | null
          starred_for_ic?: boolean | null
          status?: string | null
          summary?: string | null
          title: string
          trader_id?: string | null
          updated_at?: string | null
          upside_pct_estimate?: number | null
        }
        Update: {
          ai_generated?: boolean | null
          asset_id?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          horizon?: string | null
          id?: string
          input_assets?: string[] | null
          input_trader_ids?: string[] | null
          rating?: string | null
          raw_response?: string | null
          report_type?: string | null
          score_12m?: number | null
          score_6m?: number | null
          score_long_term?: number | null
          starred_for_ic?: boolean | null
          status?: string | null
          summary?: string | null
          title?: string
          trader_id?: string | null
          updated_at?: string | null
          upside_pct_estimate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_trader_id_fkey"
            columns: ["trader_id"]
            isOneToOne: false
            referencedRelation: "traders"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_posts: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_posts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_state: {
        Row: {
          created_at: string | null
          id: string
          last_page: number | null
          last_run: string | null
          metadata: Json | null
          status: string | null
          total_pages: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id: string
          last_page?: number | null
          last_run?: string | null
          metadata?: Json | null
          status?: string | null
          total_pages?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          last_page?: number | null
          last_run?: string | null
          metadata?: Json | null
          status?: string | null
          total_pages?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      trader_equity_history: {
        Row: {
          benchmark_value: number | null
          created_at: string | null
          date: string
          equity_value: number
          id: string
          trader_id: string | null
        }
        Insert: {
          benchmark_value?: number | null
          created_at?: string | null
          date: string
          equity_value: number
          id?: string
          trader_id?: string | null
        }
        Update: {
          benchmark_value?: number | null
          created_at?: string | null
          date?: string
          equity_value?: number
          id?: string
          trader_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trader_equity_history_trader_id_fkey"
            columns: ["trader_id"]
            isOneToOne: false
            referencedRelation: "traders"
            referencedColumns: ["id"]
          },
        ]
      }
      trader_holdings: {
        Row: {
          allocation_pct: number | null
          asset_id: string | null
          avg_open_price: number | null
          current_value: number | null
          id: string
          profit_loss_pct: number | null
          trader_id: string | null
          updated_at: string | null
        }
        Insert: {
          allocation_pct?: number | null
          asset_id?: string | null
          avg_open_price?: number | null
          current_value?: number | null
          id?: string
          profit_loss_pct?: number | null
          trader_id?: string | null
          updated_at?: string | null
        }
        Update: {
          allocation_pct?: number | null
          asset_id?: string | null
          avg_open_price?: number | null
          current_value?: number | null
          id?: string
          profit_loss_pct?: number | null
          trader_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trader_holdings_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trader_holdings_trader_id_fkey"
            columns: ["trader_id"]
            isOneToOne: false
            referencedRelation: "traders"
            referencedColumns: ["id"]
          },
        ]
      }
      trader_performance: {
        Row: {
          created_at: string | null
          id: string
          month: number
          return_pct: number | null
          trader_id: string | null
          year: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          month: number
          return_pct?: number | null
          trader_id?: string | null
          year: number
        }
        Update: {
          created_at?: string | null
          id?: string
          month?: number
          return_pct?: number | null
          trader_id?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "trader_performance_trader_id_fkey"
            columns: ["trader_id"]
            isOneToOne: false
            referencedRelation: "traders"
            referencedColumns: ["id"]
          },
        ]
      }
      trader_portfolio_history: {
        Row: {
          created_at: string | null
          date: string
          holdings: Json
          id: string
          trader_id: string | null
        }
        Insert: {
          created_at?: string | null
          date: string
          holdings?: Json
          id?: string
          trader_id?: string | null
        }
        Update: {
          created_at?: string | null
          date?: string
          holdings?: Json
          id?: string
          trader_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trader_portfolio_history_trader_id_fkey"
            columns: ["trader_id"]
            isOneToOne: false
            referencedRelation: "traders"
            referencedColumns: ["id"]
          },
        ]
      }
      traders: {
        Row: {
          active_since: string | null
          alpha: number | null
          aum: number | null
          avatar_url: string | null
          avg_holding_time_days: number | null
          avg_trades_per_week: number | null
          beta: number | null
          bio: string | null
          calmar_ratio: number | null
          copiers: number | null
          country: string | null
          created_at: string | null
          daily_drawdown: number | null
          details_synced_at: string | null
          display_name: string
          etoro_username: string
          gain_12m: number | null
          gain_24m: number | null
          id: string
          information_ratio: number | null
          max_drawdown: number | null
          omega_ratio: number | null
          profitable_months_pct: number | null
          profitable_weeks_pct: number | null
          risk_score: number | null
          sharpe_ratio: number | null
          sortino_ratio: number | null
          tags: string[] | null
          treynor_ratio: number | null
          updated_at: string | null
          verified: boolean | null
          volatility: number | null
          weekly_drawdown: number | null
        }
        Insert: {
          active_since?: string | null
          alpha?: number | null
          aum?: number | null
          avatar_url?: string | null
          avg_holding_time_days?: number | null
          avg_trades_per_week?: number | null
          beta?: number | null
          bio?: string | null
          calmar_ratio?: number | null
          copiers?: number | null
          country?: string | null
          created_at?: string | null
          daily_drawdown?: number | null
          details_synced_at?: string | null
          display_name: string
          etoro_username: string
          gain_12m?: number | null
          gain_24m?: number | null
          id?: string
          information_ratio?: number | null
          max_drawdown?: number | null
          omega_ratio?: number | null
          profitable_months_pct?: number | null
          profitable_weeks_pct?: number | null
          risk_score?: number | null
          sharpe_ratio?: number | null
          sortino_ratio?: number | null
          tags?: string[] | null
          treynor_ratio?: number | null
          updated_at?: string | null
          verified?: boolean | null
          volatility?: number | null
          weekly_drawdown?: number | null
        }
        Update: {
          active_since?: string | null
          alpha?: number | null
          aum?: number | null
          avatar_url?: string | null
          avg_holding_time_days?: number | null
          avg_trades_per_week?: number | null
          beta?: number | null
          bio?: string | null
          calmar_ratio?: number | null
          copiers?: number | null
          country?: string | null
          created_at?: string | null
          daily_drawdown?: number | null
          details_synced_at?: string | null
          display_name?: string
          etoro_username?: string
          gain_12m?: number | null
          gain_24m?: number | null
          id?: string
          information_ratio?: number | null
          max_drawdown?: number | null
          omega_ratio?: number | null
          profitable_months_pct?: number | null
          profitable_weeks_pct?: number | null
          risk_score?: number | null
          sharpe_ratio?: number | null
          sortino_ratio?: number | null
          tags?: string[] | null
          treynor_ratio?: number | null
          updated_at?: string | null
          verified?: boolean | null
          volatility?: number | null
          weekly_drawdown?: number | null
        }
        Relationships: []
      }
      trades: {
        Row: {
          action: string
          amount: number | null
          asset_id: string | null
          created_at: string | null
          executed_at: string | null
          id: string
          percentage_of_portfolio: number | null
          price: number | null
          trader_id: string | null
        }
        Insert: {
          action: string
          amount?: number | null
          asset_id?: string | null
          created_at?: string | null
          executed_at?: string | null
          id?: string
          percentage_of_portfolio?: number | null
          price?: number | null
          trader_id?: string | null
        }
        Update: {
          action?: string
          amount?: number | null
          asset_id?: string | null
          created_at?: string | null
          executed_at?: string | null
          id?: string
          percentage_of_portfolio?: number | null
          price?: number | null
          trader_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trades_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_trader_id_fkey"
            columns: ["trader_id"]
            isOneToOne: false
            referencedRelation: "traders"
            referencedColumns: ["id"]
          },
        ]
      }
      user_follows: {
        Row: {
          created_at: string
          id: string
          trader_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          trader_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          trader_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_follows_trader_id_fkey"
            columns: ["trader_id"]
            isOneToOne: false
            referencedRelation: "traders"
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
