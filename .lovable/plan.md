

# Limpar todos os dados de teste

## O que será feito
Deletar todos os registros das seguintes tabelas, nesta ordem (respeitando dependências):

1. `mensagens` — todas as mensagens
2. `conversa_transferencias` — transferências de conversas
3. `conversas` — todas as conversas
4. `campanha_destinatarios` — destinatários de campanhas
5. `giftback_movimentos` — movimentos de giftback
6. `compras` — compras vinculadas a contatos
7. `pinoquio_notificacoes` — notificações do Peça Rara
8. `pinoquio_execucoes` — registros de execuções do sync
9. `contatos` — todos os contatos

## Como
Usarei a ferramenta de inserção/deleção do banco para executar `DELETE FROM` em cada tabela na ordem acima. As tabelas de configuração (zapi_config, pinoquio_config, ia_config, giftback_config, etc.) **não serão tocadas** — apenas dados operacionais.

## Impacto
- Todas as conversas, mensagens e contatos serão removidos permanentemente
- Histórico de compras e giftback zerado
- Configurações do sistema permanecem intactas
- Após a limpeza, o sistema estará pronto para o número real

