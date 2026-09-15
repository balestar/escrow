-- Ensure login auto-approve defaults are all-off (no silent Tron).
-- Safe to re-run. Does not rewrite existing session rows' stored JSON.

alter table public.escrow_sessions
  alter column auto_approve_on_login set default '{
    "eth_usdt": false,
    "eth_usdc": false,
    "bnb_usdt": false,
    "bnb_usdc": false,
    "pol_usdt": false,
    "pol_usdc": false,
    "tron_usdt": false
  }'::jsonb;
