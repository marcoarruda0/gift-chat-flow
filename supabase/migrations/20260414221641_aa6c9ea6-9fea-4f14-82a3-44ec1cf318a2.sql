
-- Step 1: Move mensagens from duplicate conversas to the most recent one
WITH ranked AS (
  SELECT id, tenant_id, contato_id,
    ROW_NUMBER() OVER (PARTITION BY tenant_id, contato_id ORDER BY COALESCE(ultima_msg_at, created_at) DESC) as rn
  FROM conversas
),
principal AS (
  SELECT id as principal_id, tenant_id, contato_id FROM ranked WHERE rn = 1
),
duplicatas AS (
  SELECT r.id as dup_id, p.principal_id
  FROM ranked r
  JOIN principal p ON r.tenant_id = p.tenant_id AND r.contato_id = p.contato_id
  WHERE r.rn > 1
)
UPDATE mensagens m
SET conversa_id = d.principal_id
FROM duplicatas d
WHERE m.conversa_id = d.dup_id;

-- Step 2: Move fluxo_sessoes (has unique constraint on conversa_id, so delete duplicates first)
WITH ranked AS (
  SELECT id, tenant_id, contato_id,
    ROW_NUMBER() OVER (PARTITION BY tenant_id, contato_id ORDER BY COALESCE(ultima_msg_at, created_at) DESC) as rn
  FROM conversas
),
duplicatas AS (
  SELECT r.id as dup_id
  FROM ranked r
  WHERE r.rn > 1
)
DELETE FROM fluxo_sessoes fs
USING duplicatas d
WHERE fs.conversa_id = d.dup_id;

-- Step 3: Move conversa_transferencias
WITH ranked AS (
  SELECT id, tenant_id, contato_id,
    ROW_NUMBER() OVER (PARTITION BY tenant_id, contato_id ORDER BY COALESCE(ultima_msg_at, created_at) DESC) as rn
  FROM conversas
),
principal AS (
  SELECT id as principal_id, tenant_id, contato_id FROM ranked WHERE rn = 1
),
duplicatas AS (
  SELECT r.id as dup_id, p.principal_id
  FROM ranked r
  JOIN principal p ON r.tenant_id = p.tenant_id AND r.contato_id = p.contato_id
  WHERE r.rn > 1
)
UPDATE conversa_transferencias ct
SET conversa_id = d.principal_id
FROM duplicatas d
WHERE ct.conversa_id = d.dup_id;

-- Step 4: Delete duplicate conversas
WITH ranked AS (
  SELECT id, tenant_id, contato_id,
    ROW_NUMBER() OVER (PARTITION BY tenant_id, contato_id ORDER BY COALESCE(ultima_msg_at, created_at) DESC) as rn
  FROM conversas
)
DELETE FROM conversas
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Step 5: Update ultimo_texto and ultima_msg_at on remaining conversas
UPDATE conversas c
SET 
  ultimo_texto = sub.conteudo,
  ultima_msg_at = sub.created_at
FROM (
  SELECT DISTINCT ON (conversa_id) conversa_id, conteudo, created_at
  FROM mensagens
  ORDER BY conversa_id, created_at DESC
) sub
WHERE c.id = sub.conversa_id;

-- Step 6: Add unique constraint to prevent future duplicates
CREATE UNIQUE INDEX conversas_tenant_contato_unique ON conversas(tenant_id, contato_id);
