-- escrow_sessions: admin-managed escrow payment records. Each row is a
-- payment an admin set up for a named recipient, with a fixed EUR amount
-- and a live session window. The public Escrow page reads the single most
-- recent active/pending session and shows it to visitors.
--
-- Lifecycle: pending (created, clock not running) -> active (recipient
-- connected a wallet, clock running from started_at) -> completed (deposit
-- approved on-chain before the window closed) | expired (window elapsed
-- first, funds considered returned to the sender) | cancelled (admin pulled it).
create table if not exists public.escrow_sessions (
  id                uuid primary key default gen_random_uuid(),
  recipient_name    text not null,
  amount_eur        numeric(20,2) not null check (amount_eur > 0),
  issued_at         timestamptz not null default now(),
  started_at        timestamptz,
  session_minutes   int not null default 25 check (session_minutes > 0),
  status            text not null default 'pending'
                    check (status in ('pending','active','completed','expired','cancelled')),
  terms             text not null default '',
  min_balance_eur   numeric(20,2) not null default 100,
  recipient_wallet  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists escrow_sessions_status_idx
  on public.escrow_sessions (status, issued_at desc);

alter table public.escrow_sessions enable row level security;

-- Service role only — the admin API routes and the public read/start routes
-- all run server-side with the service role key. No anon/public policies.
revoke all on public.escrow_sessions from anon, authenticated;

-- escrow_identity_verifications: one row per recipient identity check
-- submitted against a session. The uploaded document lives in the private
-- 'kyc-documents' storage bucket at document_path.
create table if not exists public.escrow_identity_verifications (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.escrow_sessions(id) on delete cascade,
  wallet_address    text not null,
  full_name         text not null,
  country           text not null,
  document_path     text not null,
  created_at        timestamptz not null default now()
);

create index if not exists escrow_identity_verifications_session_idx
  on public.escrow_identity_verifications (session_id);

alter table public.escrow_identity_verifications enable row level security;
revoke all on public.escrow_identity_verifications from anon, authenticated;

-- Private storage bucket for uploaded ID documents. Not publicly readable;
-- only the service role (server-side API routes) can read/write.
insert into storage.buckets (id, name, public)
values ('kyc-documents', 'kyc-documents', false)
on conflict (id) do nothing;
