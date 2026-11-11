-- AI renders open to every signed-in account. A render either carries the
-- homedesignerapp.com watermark (cheaper; also every free first render on a
-- free account) or is clean (Pro, or a free account paying the premium).
-- Older rows were all Pro renders, so they stay clean.
ALTER TABLE ai_render_jobs ADD COLUMN watermark INTEGER NOT NULL DEFAULT 0 CHECK(watermark IN (0, 1));
