import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

interface RespostaRapida {
  id: string;
  atalho: string;
  conteudo: string;
}

interface RespostasRapidasPopupProps {
  respostas: RespostaRapida[];
  filter: string;
  onSelect: (conteudo: string) => void;
}

export function RespostasRapidasPopup({ respostas, filter, onSelect }: RespostasRapidasPopupProps) {
  const filtered = respostas.filter((r) =>
    r.atalho.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 z-50">
      <Command className="rounded-lg border shadow-md bg-popover max-h-[200px]">
        <CommandList>
          <CommandEmpty className="py-3 text-center text-sm text-muted-foreground">
            Nenhum atalho encontrado
          </CommandEmpty>
          <CommandGroup heading="Respostas Rápidas">
            {filtered.map((r) => (
              <CommandItem
                key={r.id}
                value={r.atalho}
                onSelect={() => onSelect(r.conteudo)}
                className="cursor-pointer"
              >
                <span className="font-mono text-xs text-primary mr-2">/{r.atalho}</span>
                <span className="text-sm text-muted-foreground truncate">{r.conteudo.slice(0, 60)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  );
}
