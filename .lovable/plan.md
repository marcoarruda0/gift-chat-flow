

# Melhorias no Nó "Assistente IA" do Editor de Fluxos

Baseado nas referências do BotConversa, o nó atual tem apenas 2 campos (Prompt e Máximo de turnos). Vamos expandir significativamente com todas as funcionalidades relevantes.

## Funcionalidades a implementar

### Configurações no painel lateral (`NodeConfigPanel.tsx`)

**Bloco 1 — Mensagem Inicial**
- Radio: "Mensagem Inicial Para o Contato" / "Mensagem Inicial Para a IA"
- Textarea com a mensagem (suporte a variáveis `{{nome}}`, `{{plano}}`)
- Contador de caracteres (limite 1000)

**Bloco 2 — Personalidade**
- Idioma (Select: Português, Inglês, Espanhol)
- Temperatura (Slider 0 a 2, default 1) com tooltip explicativo
- Instruções do assistente (Textarea — prompt principal do sistema)
- Instruções individuais (Textarea — variáveis de contexto por contato, ex: `Nome: {{nome}}, Plano: {{plano}}`)

**Bloco 3 — Comportamento**
- Mensagem de erro personalizada (Textarea — mensagem quando IA falha)
- Modelo (Select: gemini-2.5-flash, gemini-2.5-pro, gpt-5-mini, gpt-5)
- Contexto Geral (Textarea — informações da empresa/produto)
- Tempo de espera para agrupar mensagens (Switch + campos número/unidade em segundos)

**Bloco 4 — Condições de Saída**
- Sucesso do assistente (Textarea — descrever quando considerar sucesso)
- Interrupção do assistente (Textarea — quando interromper e transferir)
- Parar IA por inatividade (número + unidade minutos/horas)
- Salvar resumo da interação em (Select — campo do contato)

### Saídas do nó (`FlowNode.tsx`)

O nó passa a ter **2 handles de saída** (como o condicional):
- **Sucesso** (verde) — quando IA resolve a dúvida
- **Interrupção** (vermelho) — quando IA é interrompida ou transfere

### Preview no nó

Mostrar o nome do modelo e trecho das instruções do assistente.

## Arquivos afetados

| Arquivo | Mudança |
|---------|---------|
| `src/components/fluxos/NodeConfigPanel.tsx` | Reescrever seção `assistente_ia` com todos os campos acima |
| `src/components/fluxos/nodes/FlowNode.tsx` | Adicionar handles "sucesso" e "interrupcao" para `assistente_ia` |

## Detalhes técnicos

Todos os valores são salvos em `config` do nó (não há mudança de DB — são dados do JSON do fluxo):

```text
config: {
  msg_inicial_tipo: "contato" | "ia",
  msg_inicial: string,
  idioma: "pt" | "en" | "es",
  temperatura: number,
  instrucoes: string,
  instrucoes_individuais: string,
  msg_erro: string,
  modelo: string,
  contexto_geral: string,
  agrupar_msgs: boolean,
  agrupar_tempo: number,
  agrupar_unidade: "seg",
  sucesso_descricao: string,
  interrupcao_descricao: string,
  inatividade_tempo: number,
  inatividade_unidade: "min" | "hora",
  salvar_resumo_campo: string,
}
```

O painel será organizado em seções visuais com labels e descrições, similar às screenshots de referência. O Slider usará o componente `@/components/ui/slider` já existente.

