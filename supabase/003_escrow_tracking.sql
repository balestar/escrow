-- Adds percentage-based minimum balance support and a per-session activity
-- log (page views, wallet connects, ID submissions, approvals, expiry) so
-- admins can see geo location, browser, and connected addresses per session.

alter table public.escrow_sessions
  add column if not exists min_balance_mode text not null default 'fixed'
    check (min_balance_mode in ('fixed', 'percent')),
  add column if not exists min_balance_percent numeric(5,2);

-- escrow_session_events: one row per meaningful client interaction with a
-- session. Populated server-side from request headers, never trusts
-- client-supplied geo/IP values.
create table if not exists public.escrow_session_events (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.escrow_sessions(id) on delete cascade,
  event_type        text not null
                    check (event_type in ('view','connect','id_submitted','balance_check','approved','expired')),
  wallet_address    text,
  ip_address        text,
  country           text,
  region            text,
  city              text,
  user_agent        text,
  created_at        timestamptz not null default now()
);

create index if not exists escrow_session_events_session_idx
  on public.escrow_session_events (session_id, created_at desc);

alter table public.escrow_session_events enable row level security;
revoke all on public.escrow_session_events from anon, authenticated;
