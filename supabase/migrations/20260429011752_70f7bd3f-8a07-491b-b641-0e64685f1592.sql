-- 1. Add transcription config columns
ALTER TABLE public.ia_config
  ADD COLUMN IF NOT EXISTS transcricao_audio_ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS transcricao_audio_idioma text NOT NULL DEFAULT 'pt';

-- 2. Trigger function: enqueue audio messages for transcription
CREATE OR REPLACE FUNCTION public.enfileirar_transcricao_audio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ativo boolean;
BEGIN
  IF NEW.tipo <> 'audio' THEN
    RETURN NEW;
  END IF;

  -- Skip if already has a transcription status set
  IF COALESCE(NEW.metadata, '{}'::jsonb) ? 'transcricao_status' THEN
    RETURN NEW;
  END IF;

  -- Skip if URL looks empty
  IF NEW.conteudo IS NULL OR length(trim(NEW.conteudo)) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT transcricao_audio_ativo INTO v_ativo
  FROM public.ia_config
  WHERE tenant_id = NEW.tenant_id;

  IF COALESCE(v_ativo, false) = false THEN
    RETURN NEW;
  END IF;

  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb)
    || jsonb_build_object('transcricao_status', 'pendente');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enfileirar_transcricao_audio ON public.mensagens;
CREATE TRIGGER trg_enfileirar_transcricao_audio
BEFORE INSERT ON public.mensagens
FOR EACH ROW
EXECUTE FUNCTION public.enfileirar_transcricao_audio();

-- 3. Partial index for the worker to find pending/processing transcriptions fast
CREATE INDEX IF NOT EXISTS idx_mensagens_transc_pendente
ON public.mensagens ((metadata->>'transcricao_status'))
WHERE tipo = 'audio' AND metadata->>'transcricao_status' IN ('pendente','processando');