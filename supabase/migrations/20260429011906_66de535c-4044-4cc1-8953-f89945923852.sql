CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'transcrever-audio-1min') THEN
    PERFORM cron.unschedule('transcrever-audio-1min');
  END IF;
END $$;

SELECT cron.schedule(
  'transcrever-audio-1min',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://ywcgburxzwukjtqxuhyr.supabase.co/functions/v1/transcrever-audio',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl3Y2didXJ4end1a2p0cXh1aHlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1OTc0NDAsImV4cCI6MjA5MTE3MzQ0MH0.ntq7qxO-cQcqXsWGq2H-hl2M71Z_dSTlJrKTX6ZR25o"}'::jsonb,
    body := '{"mode":"batch"}'::jsonb
  );
  $cron$
);