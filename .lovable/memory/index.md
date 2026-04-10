# Project Memory

## Core
CRM + WhatsApp Bot SaaS, multi-tenant. PT-BR interface. Primary #1B4F72 (207 62% 28%), sidebar dark #1B2A4A.
Lovable Cloud (Supabase) backend. RLS isolates by tenant_id. Roles in user_roles table.
shadcn/ui components. Recharts for charts. React Flow for automation builder (future).
Z-API integration for WhatsApp messaging (per-tenant config in zapi_config table).

## Memories
- [Design tokens](mem://design/tokens) — Color palette with sidebar dark theme and accent blue
- [DB schema](mem://features/db-schema) — All tables: tenants, profiles, user_roles, contatos, giftback_config, compras, giftback_movimentos, conversas, mensagens, zapi_config
- [Auth flow](mem://features/auth) — Email/password, auto-profile creation, role-based access
- [Modules roadmap](mem://features/roadmap) — MVP done: auth, sidebar, dashboard, CRM, giftback. Next: conversas, fluxos, disparos
