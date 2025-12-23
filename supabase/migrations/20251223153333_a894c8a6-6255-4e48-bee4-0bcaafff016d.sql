-- Delete old trades for thomaspj that have null values
DELETE FROM public.trades 
WHERE trader_id = (SELECT id FROM public.traders WHERE etoro_username = 'thomaspj')
AND (position_id IS NULL OR profit_loss_pct IS NULL OR open_price IS NULL);

-- Reset details_synced_at for thomaspj to force immediate re-sync
UPDATE public.traders 
SET details_synced_at = NULL 
WHERE etoro_username = 'thomaspj';