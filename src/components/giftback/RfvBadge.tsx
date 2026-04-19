import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getSegmentoBySoma } from "@/lib/rfv-segments";

interface RfvBadgeProps {
  r: number | null | undefined;
  f: number | null | undefined;
  v: number | null | undefined;
  className?: string;
  /** Se true, mostra apenas as notas (R-F-V) sem o nome do segmento */
  compacto?: boolean;
}

export default function RfvBadge({ r, f, v, className, compacto = false }: RfvBadgeProps) {
  if (r == null && f == null && v == null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const partes = [r ?? "-", f ?? "-", v ?? "-"];
  const segmento = getSegmentoBySoma(r, f, v);
  const titulo = `R=${r ?? "-"} F=${f ?? "-"} V=${v ?? "-"} · ${segmento.nome}`;

  return (
    <Badge
      className={cn("font-mono border-transparent", segmento.textClass, className)}
      style={{ backgroundColor: segmento.cor }}
      title={titulo}
    >
      <span>{partes.join("-")}</span>
      {!compacto && <span className="ml-1.5 font-sans font-medium">· {segmento.nome}</span>}
    </Badge>
  );
}
