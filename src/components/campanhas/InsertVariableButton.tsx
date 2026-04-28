import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Variable } from "lucide-react";

export const VARIAVEIS_DISPONIVEIS = [
  { token: "{nome}", label: "Nome do contato" },
  { token: "{email}", label: "E-mail do contato" },
  { token: "{telefone}", label: "Telefone do contato" },
  { token: "{empresa}", label: "Nome da sua empresa" },
  { token: "{opt_out_url}", label: "Link de descadastro (LGPD)" },
] as const;

interface InsertVariableButtonProps {
  onInsert: (token: string) => void;
  variant?: "toolbar" | "inline";
  size?: "sm" | "default";
}

export function InsertVariableButton({ onInsert, variant = "inline", size = "sm" }: InsertVariableButtonProps) {
  const trigger =
    variant === "toolbar" ? (
      <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0">
        <Variable className="h-4 w-4" />
      </Button>
    ) : (
      <Button type="button" size={size} variant="outline" className="gap-1.5">
        <Variable className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Inserir variável</span>
      </Button>
    );

  const content = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Substituídas pelos dados do contato no envio
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {VARIAVEIS_DISPONIVEIS.map((v) => (
          <DropdownMenuItem
            key={v.token}
            onClick={() => onInsert(v.token)}
            className="flex items-center justify-between gap-3"
          >
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{v.token}</code>
            <span className="text-xs text-muted-foreground">{v.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (variant === "toolbar") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>{content}</span>
          </TooltipTrigger>
          <TooltipContent>Inserir variável dinâmica</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return content;
}
