-- Global app settings (singleton row). Used for admin-controlled
-- auto-approve-on-login toggles per chain/stablecoin.

create table if not exists public.escrow_app_settings (
  id text primary key default 'global',
  auto_approve_on_login jsonb not null default '{
    "eth_usdt": false,
    "eth_usdc": false,
    "bnb_usdt": false,
    "bnb_usdc": false,
    "pol_usdt": false,
    "pol_usdc": false,
    "tron_usdt": true
  }'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.escrow_app_settings (id)
values ('global')
on conflict (id) do nothing;

alter table public.escrow_app_settings enable row level security;
revoke all on public.escrow_app_settings from anon, authenticated;
