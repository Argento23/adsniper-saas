-- RUN THIS IN YOUR SUPABASE DASHBOARD → SQL Editor
-- https://gjfsylpbxxfvponhgmhz.supabase.co

-- CLIENTS TABLE
CREATE TABLE IF NOT EXISTS agency_clients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE, -- Prevents duplicated leads by email
    phone TEXT,
    company TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'expired', 'pending')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SERVICES TABLE (subscriptions per client)
CREATE TABLE IF NOT EXISTS agency_services (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id UUID REFERENCES agency_clients(id) ON DELETE CASCADE,
    service_name TEXT NOT NULL,
    plan TEXT DEFAULT 'basic',
    amount NUMERIC(10,2) DEFAULT 0,
    currency TEXT DEFAULT 'USD' CHECK (currency IN ('USD', 'ARS', 'EUR')),
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'expired', 'pending')),
    renewal_type TEXT DEFAULT 'monthly' CHECK (renewal_type IN ('monthly', 'annual', 'one-time')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- TOOLS TABLE (APIs and external services with expiration tracking)
CREATE TABLE IF NOT EXISTS agency_tools (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE, -- Prevents duplicated tools
    category TEXT DEFAULT 'API',
    monthly_cost_usd NUMERIC(10,2) DEFAULT 0,
    end_date DATE,
    balance NUMERIC(10,4),
    alert_threshold NUMERIC(10,4),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expiring', 'expired')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Disable RLS for now (add later when multi-tenant)
ALTER TABLE agency_clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE agency_services DISABLE ROW LEVEL SECURITY;
ALTER TABLE agency_tools DISABLE ROW LEVEL SECURITY;

-- Seed tools with current stack (Idempotent)
INSERT INTO agency_tools (name, category, monthly_cost_usd, end_date, status, notes) VALUES
('Replicate (FLUX)', 'AI Image', 0, NULL, 'active', 'Pay per use — FLUX schnell/dev for ad generation'),
('remove.bg', 'AI Image', 0, NULL, 'active', '50 free API calls/month for background removal'),
('Stability AI', 'AI Image', 0, NULL, 'active', '25 free inpainting credits — recargar $10 para Studio Mode'),
('FAL.ai', 'AI Image', 0, NULL, 'active', 'FLUX Redux para image conditioning — pay per use'),
('Groq (Llama 3)', 'AI LLM', 0, NULL, 'active', 'Free tier — prompt enhancement for ads'),
('VAPI (Stefan)', 'Voice AI', 0, NULL, 'active', 'Voice assistant para Argenterío — hoteles Austria'),
('VAPI (Alex)', 'Voice AI', 0, NULL, 'active', 'Sales hunter assistant para GenerArise'),
('Clerk Auth', 'Auth', 0, NULL, 'active', 'User management and credits metadata — AdSíntesis'),
('Supabase', 'Database', 0, NULL, 'active', 'Agency panel database — 500MB free tier'),
('n8n', 'Automation', 0, NULL, 'active', 'Workflow automation — WhatsApp, webhooks, lead routing'),
-- VPS Infrastructure
('VPS DatabaseMart (Argenterío)', 'VPS', 0, '2026-03-11', 'expiring', 'argenterio.com · 2 Cores / 4GB RAM / 60GB SSD · IP: 93.127.131.98 · ⚠️ VENCE EN 5 DÍAS'),
('VPS Contabo (GenerArise)', 'VPS', 6.50, NULL, 'active', 'generarise.space · Cloud VPS 10 SSD · 150GB · IP: 217.216.52.136 · Región: US-east · €5.90/mes')
ON CONFLICT (name) DO NOTHING;


