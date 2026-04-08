import { Zap, MessageSquare, GitBranch, Clock, Bot, Tag, Webhook, UserCheck } from "lucide-react";

export const NODE_TYPE_CONFIG = {
  gatilho: {
    label: "Gatilho",
    icon: Zap,
    color: "hsl(142, 71%, 45%)",
    bgColor: "hsl(142, 76%, 95%)",
    borderColor: "hsl(142, 71%, 45%)",
  },
  conteudo: {
    label: "Conteúdo",
    icon: MessageSquare,
    color: "hsl(207, 62%, 28%)",
    bgColor: "hsl(207, 80%, 95%)",
    borderColor: "hsl(207, 62%, 48%)",
  },
  condicional: {
    label: "Condicional",
    icon: GitBranch,
    color: "hsl(45, 93%, 47%)",
    bgColor: "hsl(48, 96%, 95%)",
    borderColor: "hsl(45, 93%, 47%)",
  },
  atraso: {
    label: "Atraso",
    icon: Clock,
    color: "hsl(215, 16%, 47%)",
    bgColor: "hsl(210, 20%, 95%)",
    borderColor: "hsl(215, 16%, 47%)",
  },
  assistente_ia: {
    label: "Assistente IA",
    icon: Bot,
    color: "hsl(271, 76%, 53%)",
    bgColor: "hsl(270, 80%, 96%)",
    borderColor: "hsl(271, 76%, 53%)",
  },
  tag: {
    label: "Tag",
    icon: Tag,
    color: "hsl(25, 95%, 53%)",
    bgColor: "hsl(33, 100%, 96%)",
    borderColor: "hsl(25, 95%, 53%)",
  },
  webhook: {
    label: "Webhook",
    icon: Webhook,
    color: "hsl(0, 84%, 60%)",
    bgColor: "hsl(0, 86%, 97%)",
    borderColor: "hsl(0, 84%, 60%)",
  },
  transferir: {
    label: "Transferir",
    icon: UserCheck,
    color: "hsl(330, 81%, 60%)",
    bgColor: "hsl(330, 80%, 96%)",
    borderColor: "hsl(330, 81%, 60%)",
  },
} as const;

export type FlowNodeType = keyof typeof NODE_TYPE_CONFIG;
