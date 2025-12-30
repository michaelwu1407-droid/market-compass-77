-- Fix post linkage: update posts where trader_id is null but etoro_username matches a trader
UPDATE posts
SET trader_id = traders.id
FROM traders
WHERE posts.trader_id IS NULL
AND LOWER(posts.etoro_username) = LOWER(traders.etoro_username);

-- Fix trades linkage: update trades where trader_id is null (if any) - though trades usually come with trader_id
-- but we can ensure consistency if we had a username column in trades (we don't, usually).
-- So just posts for now.
