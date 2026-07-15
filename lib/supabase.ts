import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Client for browser-side calls (respects RLS) — safe to use anywhere
export const supabase = supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null as any;

// Admin client — SERVER ONLY (SUPABASE_SERVICE_ROLE_KEY not exposed to browser)
// Use only in API routes / server components
export function getSupabaseAdmin() {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    if (!supabaseUrl || !serviceKey) throw new Error('Supabase admin not configured');
    return createClient(supabaseUrl, serviceKey);
}

// Types for the Agency dashboard
export type ClientStatus = 'active' | 'paused' | 'expired' | 'pending';
export type ServiceName = 'AdSíntesis' | 'VAPI Stefan' | 'VAPI Alex' | 'n8n' | 'Argenterío' | 'Cilo' | 'Otro';

export interface AgencyClient {
    id: string;
    name: string;
    email: string;
    phone?: string;
    company?: string;
    status: ClientStatus;
    notes?: string;
    created_at: string;
}

export interface AgencyService {
    id: string;
    client_id: string;
    service_name: ServiceName;
    plan: string;
    amount: number;
    currency: 'USD' | 'ARS' | 'EUR';
    start_date: string;
    end_date: string;
    status: ClientStatus;
    renewal_type: 'monthly' | 'annual' | 'one-time';
    notes?: string;
    created_at: string;
    // joined
    client?: AgencyClient;
}

export interface AgencyTool {
    id: string;
    name: string;
    category: string;
    monthly_cost_usd: number;
    end_date?: string;
    balance?: number;
    alert_threshold?: number;
    status: 'active' | 'expiring' | 'expired';
    notes?: string;
}
