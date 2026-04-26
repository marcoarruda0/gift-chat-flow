import { Button } from "@/components/ui/button";
import { Copy, Plus } from "lucide-react";
import { toast } from "sonner";

interface TemplateVariablesGuideProps {
  /** Quantidade de placeholders {{N}} já presentes no texto. */
  used: number;
  /** Limite máximo de placeholders permitidos (Meta: ilimitado no body, 1 no header). */
  max?: number;
  /** Insere a string fornecida no input/textarea controlado pelo pai. */
  onInsert: (token: string) => void;
  /** Texto do contexto: "corpo" ou "cabeçalho". */
  context?: "corpo" | "cabeçalho";
}

export function TemplateVariablesGuide({
  used,
  max = 99,
  onInsert,
  context = "corpo",
}: TemplateVariablesGuideProps) {
  const next = used + 1;
  const podeAdicionar = next <= max;

  // Mostra os já usados + a próxima sugestão
  const tokens = Array.from({ length: used }, (_, i) => i + 1);

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      toast.success(`${token} copiado`);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="text-xs text-muted-foreground leading-relaxed">
          Use <code className="bg-background px-1 py-0.5 rounded font-mono text-[11px]">{`{{1}}`}</code>,{" "}
          <code className="bg-background px-1 py-0.5 rounded font-mono text-[11px]">{`{{2}}`}</code>… no{" "}
          {context} para variáveis. Defina um exemplo para cada uma. No envio, os
          exemplos serão substituídos pelos dados reais do contato.
        </div>
        {podeAdicionar && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 shrink-0"
            onClick={() => onInsert(`{{${next}}}`)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Inserir {`{{${next}}}`}
          </Button>
        )}
      </div>

      {tokens.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {tokens.map((n) => {
            const token = `{{${n}}}`;
            return (
              <button
                key={n}
                type="button"
                onClick={() => copy(token)}
                className="group inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[11px] font-mono hover:bg-accent transition-colors"
                title="Clique para copiar"
              >
                {token}
                <Copy className="h-2.5 w-2.5 opacity-50 group-hover:opacity-100" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
