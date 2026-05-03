## Objetivo

Refinar a página **Vendas Online** (`src/pages/ChamadoDenis.tsx`) com 3 melhorias: (1) seções colapsáveis e remoção do layout em cards, (2) comprovante de entrega imprimível/PDF, (3) histórico de auditoria de entregas.

---

## 1. Seções colapsáveis + tabela única em "Produtos vendidos"

Usar `Collapsible` (`@/components/ui/collapsible.tsx`, já existente) para agrupar três blocos da página:

```
[▾] Vendas online (tabela principal + KPIs + filtros)
[▾] Produtos vendidos (filtros + tabela)
[▾] Locais (cadastro + lista)
```

- Cabeçalho de cada grupo: ícone chevron + título + contador (ex.: "Produtos vendidos · 12").
- Estado de abertura persistido em `localStorage` (`vendas-online:groups`) para não fechar a cada reload.
- Padrão inicial: todos abertos.

Em "Produtos vendidos":
- **Remover** o bloco mobile de cards (`md:hidden`).
- Manter apenas `<Table>` para todas as larguras, dentro de `div.overflow-x-auto` (já existe). Em telas estreitas o usuário rola horizontalmente — comportamento padrão do resto da página.
- Reduzir paddings e usar truncate em colunas longas (Descrição, Cliente) para melhor densidade.

---

## 2. Comprovante de entrega (visualizar + imprimir/PDF)

### 2.1 Componente `ComprovanteEntregaDialog`

Novo arquivo: `src/components/vendas-online/ComprovanteEntregaDialog.tsx`.

- Recebe `item: Item` e dados do tenant (nome, opcional).
- Renderiza em um `<Dialog>` o **comprovante formatado** (HTML imprimível):
  - Cabeçalho: "Comprovante de Entrega — Vendas Online"
  - Dados do produto: #ID, descrição, valor, forma de pagamento.
  - Dados do comprador: nome, CPF, email, telefone, data do pagamento.
  - Dados da retirada: data/hora da entrega, "Quem retirou" (próprio comprador / outra pessoa + nome + doc), usuário do sistema que registrou.
  - Imagem da assinatura (`<img src={item.entregue_assinatura}>`).
  - Rodapé: data de emissão.
- Botões:
  - **Imprimir** — `window.print()` aplicado a um wrapper com `id="comprovante-print"`. CSS global `@media print` (em `src/index.css`) oculta tudo exceto `#comprovante-print`.
  - **Baixar PDF** — gerar via `html2canvas` + `jsPDF` (instalar dependências). Captura o nó do comprovante e exporta `comprovante-entrega-{numero}.pdf`.
  - **Fechar**.

### 2.2 Integração

Na coluna "Entregue?" da tabela de vendidos, quando `item.entregue === true`:
- Manter o badge "Sim" clicável (abre `ComprovanteEntregaDialog`, substitui o `verEntregaItem` atual).
- Adicionar um botão extra `Printer` (lucide) ao lado da coluna de ações: abre direto o comprovante.

Reutilizar o componente também na visualização atual de "ver entrega" (substituir o `Dialog` simples de assinatura existente).

### Dependências a adicionar
- `jspdf`
- `html2canvas`

---

## 3. Histórico/auditoria de entregas

### 3.1 Migration

Nova tabela `chamado_denis_entregas_log`:

| Coluna | Tipo | Notas |
|---|---|---|
| id | uuid PK default gen_random_uuid() | |
| tenant_id | uuid not null | |
| item_id | uuid not null | sem FK (mesmo padrão do projeto) |
| acao | text not null | `entregue` ou `desfeito` |
| usuario_id | uuid | quem disparou (auth.uid) |
| usuario_nome | text | snapshot do nome do profile |
| retirante_proprio | boolean | snapshot |
| retirante_nome | text | snapshot |
| retirante_doc | text | snapshot |
| assinatura | text | snapshot do data URL |
| created_at | timestamptz default now() | |

**RLS** (mesmo padrão das outras tabelas do módulo):
- SELECT: `tenant_id = get_user_tenant_id(auth.uid()) OR has_role(auth.uid(),'admin_master')`
- INSERT: idem (with check).
- Sem UPDATE/DELETE para usuários comuns (log imutável).

### 3.2 Escrita do log

Em `confirmarEntrega` e `desfazerEntrega` (`ChamadoDenis.tsx`), após o `update` bem-sucedido, inserir uma linha em `chamado_denis_entregas_log` com `acao = "entregue" | "desfeito"` e snapshot dos dados do payload + `profile.nome`.

### 3.3 UI — visualização do histórico

No `ComprovanteEntregaDialog`, adicionar uma aba/seção **"Histórico"**:
- Lista cronológica (desc) das ações daquele `item_id`.
- Cada linha: data/hora, usuário, ação (badge), retirante.
- Carregada sob demanda quando o diálogo abre.

---

## Arquivos afetados

- `src/pages/ChamadoDenis.tsx` — Collapsibles, remoção dos cards mobile, escrita no log, integração com novo diálogo.
- `src/components/vendas-online/ComprovanteEntregaDialog.tsx` *(novo)* — comprovante imprimível + PDF + histórico.
- `src/index.css` — regras `@media print` para `#comprovante-print`.
- `supabase/migrations/<novo>.sql` — tabela `chamado_denis_entregas_log` + policies.
- `package.json` — dependências `jspdf`, `html2canvas`.

## Fora de escopo (próximos prompts)
- Envio automático do comprovante por WhatsApp/Email ao comprador.
- Exportar todo o histórico de entregas em CSV.
- Filtro/listagem global de auditoria fora do contexto do item.
