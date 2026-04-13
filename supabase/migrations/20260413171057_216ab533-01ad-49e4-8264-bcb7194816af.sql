
-- Consolidate duplicate conversations: move all messages to the oldest conversation per contact
DO $$
DECLARE
  rec RECORD;
  main_conversa_id uuid;
BEGIN
  -- For each tenant+contato that has more than one conversation
  FOR rec IN
    SELECT tenant_id, contato_id, MIN(created_at) AS oldest_created
    FROM public.conversas
    GROUP BY tenant_id, contato_id
    HAVING COUNT(*) > 1
  LOOP
    -- Get the oldest conversation id
    SELECT id INTO main_conversa_id
    FROM public.conversas
    WHERE tenant_id = rec.tenant_id AND contato_id = rec.contato_id
    ORDER BY created_at ASC
    LIMIT 1;

    -- Move all messages from duplicate conversations to the main one
    UPDATE public.mensagens
    SET conversa_id = main_conversa_id
    WHERE conversa_id IN (
      SELECT id FROM public.conversas
      WHERE tenant_id = rec.tenant_id
        AND contato_id = rec.contato_id
        AND id != main_conversa_id
    );

    -- Move fluxo_sessoes
    UPDATE public.fluxo_sessoes
    SET conversa_id = main_conversa_id
    WHERE conversa_id IN (
      SELECT id FROM public.conversas
      WHERE tenant_id = rec.tenant_id
        AND contato_id = rec.contato_id
        AND id != main_conversa_id
    );

    -- Delete transfer records for duplicate conversations
    DELETE FROM public.conversa_transferencias
    WHERE conversa_id IN (
      SELECT id FROM public.conversas
      WHERE tenant_id = rec.tenant_id
        AND contato_id = rec.contato_id
        AND id != main_conversa_id
    );

    -- Delete duplicate conversations
    DELETE FROM public.conversas
    WHERE tenant_id = rec.tenant_id
      AND contato_id = rec.contato_id
      AND id != main_conversa_id;

    -- Update main conversation to be open with latest message info
    UPDATE public.conversas
    SET status = 'aberta',
        ultima_msg_at = (SELECT MAX(created_at) FROM public.mensagens WHERE conversa_id = main_conversa_id),
        ultimo_texto = (SELECT conteudo FROM public.mensagens WHERE conversa_id = main_conversa_id ORDER BY created_at DESC LIMIT 1),
        nao_lidas = 0
    WHERE id = main_conversa_id;
  END LOOP;
END $$;
