## Mover instância Z-API: PR SANTO ANDRE → PR TATUAPE

### Diagnóstico

A tabela `zapi_config` tem **um único registro**, vinculado ao tenant `PR SANTO ANDRE` (`fcaec321…`). Quando você troca para `PR TATUAPE` (`1c38632e…`), o `zapi-proxy` busca a config pelo `tenant_id` do perfil atual, não encontra nada e retorna `"Z-API não configurado para este tenant"`. Isso é o comportamento correto do isolamento multi-tenant.

Como a Z-API permite que **uma instância só esteja ativa em um lugar** (mesmo `instance_id` + token + client_token), a solução é mover o registro de tenant.

### O que será feito

**Migração SQL única** que:

1. Remove a config antiga do PR TATUAPE (se existir, por segurança).
2. Atualiza o `tenant_id` do registro existente em `zapi_config` de `fcaec321-57c6-445c-8e69-332408db6a86` (PR SANTO ANDRE) para `1c38632e-5ee9-4502-8f7f-80eeecb07d4a` (PR TATUAPE).

Mantém `instance_id`, `token` e `client_token` intactos — nenhum reset de QR code, a conexão segue ativa, apenas passa a “pertencer” ao outro tenant.

### Efeitos colaterais (importante saber)

- **PR SANTO ANDRE** deixa imediatamente de receber e enviar mensagens via WhatsApp. A página `/configuracoes/zapi` mostrará tudo vazio para esse tenant.
- **Histórico de conversas, contatos e mensagens já gravados** em PR SANTO ANDRE **permanecem nesse tenant** — não são movidos. Apenas a configuração de conexão muda de dono.
- **Webhook da Z-API**: como o `zapi-webhook` resolve o tenant pelo `instance_id` lendo a `zapi_config`, novas mensagens passarão automaticamente a cair em **PR TATUAPE** sem precisar mexer no painel da Z-API.
- Se um dia quiser voltar a usar Z-API no PR SANTO ANDRE, terá que criar uma nova instância no painel da Z-API (novo número/QR) e cadastrar.

### Validação após aplicar

- Trocar para PR TATUAPE → abrir `/configuracoes/zapi` → deve mostrar a instância conectada.
- Trocar para PR SANTO ANDRE → `/configuracoes/zapi` deve mostrar tela vazia (sem config).
- Enviar uma mensagem de teste no WhatsApp → deve aparecer em PR TATUAPE.

### Sem alterações de código

Apenas dados. Nenhum arquivo `.ts`/`.tsx` precisa ser tocado.
