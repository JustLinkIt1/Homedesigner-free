-- A render can finish at the provider yet never reach the app (its image
-- download keeps failing). deliverRender counts failed downloads and refunds a
-- never-delivered job once, after a terminal failure; a job whose image was
-- delivered even once is never refunded.
ALTER TABLE ai_render_jobs ADD COLUMN delivery_failures INTEGER NOT NULL DEFAULT 0 CHECK(delivery_failures >= 0);
ALTER TABLE ai_render_jobs ADD COLUMN delivered_at INTEGER;
-- Jobs finished before this migration: treat as delivered, so history is never refunded.
UPDATE ai_render_jobs SET delivered_at = created_at WHERE status = 'complete';
