import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Variable } from "lucide-react";
import { VARIAVEIS_DISPONIVEIS } from "@/lib/giftback-comunicacao";

interface InsertGiftbackVarButtonProps {
  onInsert: (token: string) => void;
}

export function InsertGiftbackVarButton({ onInsert }: InsertGiftbackVarButtonProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8">
          <Variable className="h-3 w-3 mr-1" />
          Inserir variável
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="end">
        <div className="text-xs font-medium text-muted-foreground px-2 py-1.5">
          Variáveis disponíveis
        </div>
        <div className="space-y-0.5 max-h-72 overflow-y-auto">
          {VARIAVEIS_DISPONIVEIS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => onInsert(`{{${v.key}}}`)}
              className="w-full text-left px-2 py-1.5 rounded text-sm hover:bg-accent flex flex-col"
            >
              <span className="font-mono text-xs text-primary">{`{{${v.key}}}`}</span>
              <span className="text-xs text-muted-foreground">
                {v.label} · ex: {v.exemplo}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
