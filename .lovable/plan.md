

# Funcionalidade: Reconectar Instância Z-API

## Situação atual
A página `ZapiConfig.tsx` já permite salvar/atualizar credenciais e testar conexão. Mas falta:
- Botão explícito de **Reconectar** (gerar novo QR Code via Z-API)
- Botão de **Desconectar** (desligar a instância)
- Exibição do **QR Code** para escanear quando desconectado
- Feedback claro do status em tempo real

## Dados de mensagens
Não há impacto nos dados. Todas as tabelas usam `tenant_id` para isolamento. Reconectar a instância não altera nem apaga nenhum registro existente em `conversas`, `mensagens` ou `contatos`.

## Alterações

### 1. `src/pages/ZapiConfig.tsx`

Adicionar ao card de credenciais:

- **Botão "Desconectar"**: chama `zapi-proxy` com endpoint `disconnect` (POST). Atualiza status para `desconectado`.
- **Botão "Reconectar"**: chama `zapi-proxy` com endpoint `restart` (POST). Força a instância a reiniciar e gerar novo QR Code.
- **Exibição do QR Code**: quando status é `desconectado`, chamar endpoint `qr-code/image` via `zapi-proxy` e renderizar a imagem do QR Code para o usuário escanear.
- **Polling de status**: após exibir o QR Code, fazer polling a cada 5 segundos no endpoint `status` para detectar quando a conexão for restabelecida e atualizar o badge automaticamente.

### 2. Nenhuma migration necessária
Tabela `zapi_config` já tem a coluna `status`. Nenhuma tabela nova é necessária.

### 3. Nenhuma edge function nova
O `zapi-proxy` existente já suporta qualquer endpoint da Z-API — basta passar o endpoint desejado (`disconnect`, `restart`, `qr-code/image`).

## Fluxo do usuário

```text
Status: Desconectado
  → Clica "Reconectar"
  → Sistema chama restart + exibe QR Code
  → Usuário escaneia com WhatsApp
  → Polling detecta conexão
  → Badge muda para "Conectado" ✅

Status: Conectado
  → Clica "Desconectar"  
  → Confirma no dialog
  → Sistema chama disconnect
  → Badge muda para "Desconectado"
```

## Arquivo afetado
- `src/pages/ZapiConfig.tsx`

