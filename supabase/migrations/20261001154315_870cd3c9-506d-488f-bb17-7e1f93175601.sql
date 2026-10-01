CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE public.internal_tokens (
  name text PRIMARY KEY,
  token text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.internal_tokens TO service_role;
ALTER TABLE public.internal_tokens ENABLE ROW LEVEL SECURITY;
INSERT INTO public.internal_tokens (name) VALUES ('daily_backup') ON CONFLICT DO NOTHING;

-- 00:00 WITA (UTC+8) = 16:00 UTC
SELECT cron.schedule(
  'scoffey-daily-backup',
  '0 16 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--60fb1188-65a1-4503-8956-e0dbb2664504.lovable.app/api/public/cron/daily-backup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT token FROM public.internal_tokens WHERE name = 'daily_backup')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);