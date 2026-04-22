-- ============================================
-- Schema do Banco de Dados - Unicom Digital Dashboard
-- Agência de Marketing Digital Médico
-- ============================================

-- Habilitar extensão para UUID
create extension if not exists "pgcrypto";

-- ============================================
-- Clientes da agência
-- ============================================
create table if not exists clients (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    instagram_account_id text,
    facebook_page_id text,
    ads_account_id text,
    specialty text,
    active boolean default true,
    created_at timestamp default now()
  );

-- ============================================
-- Métricas orgânicas (engajamento)
-- ============================================
create table if not exists organic_metrics (
    id uuid primary key default gen_random_uuid(),
    client_id uuid references clients(id) on delete cascade,
    date date not null,
    platform text not null, -- 'instagram' ou 'facebook'
  followers integer,
    reach integer,
    impressions integer,
    profile_views integer,
    engagement_rate numeric(5,2),
    likes integer,
    comments integer,
    shares integer,
    saves integer,
    stories_reach integer,
    stories_replies integer,
    top_post_id text,
    top_post_engagement integer,
    created_at timestamp default now()
  );

-- ============================================
-- Métricas de tráfego pago
-- ============================================
create table if not exists paid_metrics (
    id uuid primary key default gen_random_uuid(),
    client_id uuid references clients(id) on delete cascade,
    date date not null,
    campaign_id text,
    campaign_name text,
    adset_id text,
    adset_name text,
    spend numeric(10,2),
    impressions integer,
    reach integer,
    clicks integer,
    ctr numeric(5,2),
    cpm numeric(10,2),
    cpc numeric(10,2),
    leads integer,
    cost_per_lead numeric(10,2),
    messages integer,
    cost_per_message numeric(10,2),
    frequency numeric(5,2),
    budget_planned numeric(10,2),
    created_at timestamp default now()
  );

-- ============================================
-- Etapas do funil de conversão
-- ============================================
create table if not exists funnel_metrics (
    id uuid primary key default gen_random_uuid(),
    client_id uuid references clients(id) on delete cascade,
    date date not null,
    impressions integer,
    clicks integer,
    messages integer,
    appointments integer,
    patients integer,
    impression_to_click numeric(5,2),
    click_to_message numeric(5,2),
    message_to_appointment numeric(5,2),
    appointment_to_patient numeric(5,2),
    created_at timestamp default now()
  );

-- ============================================
-- Sugestões de otimização geradas por IA
-- ============================================
create table if not exists ai_suggestions (
    id uuid primary key default gen_random_uuid(),
    client_id uuid references clients(id) on delete cascade,
    generated_at timestamp default now(),
    type text not null, -- 'organic', 'paid', 'funnel'
  priority text not null, -- 'high', 'medium', 'low'
  suggestion text not null,
    metric_trigger text,
    metric_value text,
    status text default 'pending' -- 'pending', 'applied', 'dismissed'
);

-- ============================================
-- Índices para melhorar performance de consultas
-- ============================================
create index if not exists idx_organic_metrics_client_date on organic_metrics(client_id, date desc);
create index if not exists idx_paid_metrics_client_date on paid_metrics(client_id, date desc);
create index if not exists idx_funnel_metrics_client_date on funnel_metrics(client_id, date desc);
create index if not exists idx_ai_suggestions_client on ai_suggestions(client_id, generated_at desc);

-- ============================================
-- Habilitar Row Level Security (RLS)
-- ============================================
alter table clients enable row level security;
alter table organic_metrics enable row level security;
alter table paid_metrics enable row level security;
alter table funnel_metrics enable row level security;
alter table ai_suggestions enable row level security;

-- Políticas: permitir acesso via service_role e anon (para uso interno)
create policy "Acesso total para service role" on clients for all using (true);
create policy "Acesso total para service role" on organic_metrics for all using (true);
create policy "Acesso total para service role" on paid_metrics for all using (true);
create policy "Acesso total para service role" on funnel_metrics for all using (true);
create policy "Acesso total para service role" on ai_suggestions for all using (true);
