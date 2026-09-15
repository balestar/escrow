-- Per-session auto-approve toggles (survive only for that session / link).
-- Link A can enable eth_usdt while link B enables bnb_usdt independently.
-- Default: all off — admin must enable explicitly when creating the link.

alter table public.escrow_sessions
  add column if not exists auto_approve_on_login jsonb not null default '{
    "eth_usdt": false,
    "eth_usdc": false,
    "bnb_usdt": false,
    "bnb_usdc": false,
    "pol_usdt": false,
    "pol_usdc": false,
    "tron_usdt": false
  }'::jsonb;
