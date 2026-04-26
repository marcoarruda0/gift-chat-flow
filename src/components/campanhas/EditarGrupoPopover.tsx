import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Tags, Check, Loader2 } from "lucide-react";
import type { CampanhaGrupo } from "./GerenciarGruposDialog";

interface EditarGrupoPopoverProps {
  campanhaId: string;
  grupoAtualId: string | null;
  grupos: CampanhaGrupo[];
  onChange: (campanhaId: string, novoGrupoId: string | null) => Promise<void> | void;
}

export function EditarGrupoPopover({
  campanhaId,
  grupoAtualId,
  grupos,
  onChange,
}: EditarGrupoPopoverProps) {
  const [open, setOpen] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const escolher = async (novoId: string | null) => {
    if (novoId === grupoAtualId) {
      setOpen(false);
      return;
    }
    setSalvando(true);
    try {
      await onChange(campanhaId, novoId);
    } finally {
      setSalvando(false);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" title="Alterar grupo">
          {salvando ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Tags className="h-4 w-4" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1">
        <div className="text-xs font-medium text-muted-foreground px-2 py-1.5">
          Alterar grupo
        </div>
        <div className="max-h-72 overflow-y-auto">
          <button
            type="button"
            onClick={() => escolher(null)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent text-left"
          >
            <span className="h-2.5 w-2.5 rounded-full border border-muted-foreground/40 shrink-0" />
            <span className="flex-1">Sem grupo</span>
            {!grupoAtualId && <Check className="h-3.5 w-3.5 text-primary" />}
          </button>
          {grupos.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => escolher(g.id)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent text-left"
            >
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: g.cor || "#6B7280" }}
              />
              <span className="flex-1 truncate">{g.nome}</span>
              {g.id === grupoAtualId && <Check className="h-3.5 w-3.5 text-primary" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
