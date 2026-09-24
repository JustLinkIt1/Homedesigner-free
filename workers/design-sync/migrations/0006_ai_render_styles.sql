-- Server-owned style IDs keep prompts and provider cost controls off the client.
ALTER TABLE ai_render_jobs ADD COLUMN style TEXT NOT NULL DEFAULT 'photorealistic'
  CHECK(style IN ('photorealistic','modern','scandinavian','industrial','coastal','luxury'));
