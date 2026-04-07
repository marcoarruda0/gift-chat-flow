
# CRM + WhatsApp Bot Platform — MVP (Fase 1)

## Visão Geral
Plataforma SaaS multi-tenant com CRM, sistema Giftback e Dashboard. Interface em português brasileiro, design limpo com sidebar escura e accent azul (#1B4F72). Backend via Lovable Cloud (Supabase).

---

## 1. Schema do Banco + Auth + Multi-tenancy

### Tabelas a criar:
- **tenants** — id, nome, plano, status, created_at
- **profiles** — id (FK auth.users), tenant_id, nome, avatar_url, departamento, created_at
- **user_roles** — id, user_id, role (enum: admin_master, admin_tenant, atendente, caixa)
- **contatos** — id, tenant_id, nome, telefone, cpf, email, data_nascimento, endereco, tags (text[]), notas, saldo_giftback, created_at, updated_at
- **giftback_config** — id, tenant_id, percentual, validade_dias, compra_minima, credito_maximo, max_resgate_pct
- **compras** — id, tenant_id, contato_id, valor, giftback_gerado, giftback_usado, operador_id, created_at
- **giftback_movimentos** — id, tenant_id, contato_id, compra_id, tipo (credito/debito/expiracao), valor, validade, status, created_at

### Segurança:
- RLS em todas as tabelas, isolando por tenant_id
- Função `has_role()` (security definer) para checar roles sem recursão
- Trigger para criar profile automaticamente no signup
- Trigger para updated_at automático

### Auth:
- Login com email/senha
- Tela de login com campo de email + senha, visual limpo
- Após login, redireciona para Dashboard

---

## 2. Sidebar + Navegação

- Sidebar escura fixa à esquerda com ícones + labels
- Itens: Dashboard, Contatos, Conversas, Fluxos, Disparos, Giftback, Base de Conhecimento, Configurações
- Item "Admin Master" visível apenas para role admin_master
- Collapsible em mobile
- Highlight da rota ativa com NavLink
- SidebarTrigger sempre visível no header

---

## 3. Dashboard

- Cards de métricas: Total de contatos, Conversas ativas (placeholder 0), Mensagens enviadas (placeholder), Giftback emitido vs resgatado
- Gráfico de barras (Recharts) — mensagens por dia, últimos 30 dias (dados reais quando disponíveis, placeholder por ora)
- Loading states e empty states

---

## 4. CRM — Contatos

### Listagem:
- Tabela com colunas: nome, telefone, CPF, tags (chips), saldo giftback, última interação
- Busca por nome, telefone ou CPF
- Filtros: tags, saldo giftback > 0
- Botões: Novo contato, Importar CSV, Exportar CSV

### Ficha do contato (detalhe):
- Dados editáveis: nome, telefone, CPF, email, nascimento, endereço, notas
- Seção de tags com chips (adicionar/remover)
- Timeline unificada: compras registradas, giftback gerado/resgatado, tags
- Saldo giftback com detalhamento (cada crédito, valor, validade, status)

---

## 5. Giftback

### Configuração (admin):
- Formulário: percentual de retorno, validade em dias, compra mínima, crédito máximo, % máximo de resgate
- Salvar no banco

### Painel do Caixa (/giftback/caixa):
- Interface simplificada, mobile-first
- Busca por CPF ou telefone
- Card do cliente: nome, saldo, validade próxima
- Formulário "Registrar Compra": valor, toggle "Aplicar giftback?" com campo de valor
- Resumo pós-registro: valor compra, giftback usado, giftback gerado, novo saldo

### Relatório (admin):
- Cards: total emitido, resgatado, expirado, saldo em circulação
- Tabela de movimentações

---

## Design & UX
- Cores: sidebar escura (#1B2A4A), fundo claro, accent azul (#1B4F72)
- Componentes shadcn/ui
- Responsivo (mobile-first no painel do caixa)
- Loading skeletons, empty states, toast notifications
- Confirmação em ações destrutivas (dialogs)
- Interface 100% em português brasileiro
