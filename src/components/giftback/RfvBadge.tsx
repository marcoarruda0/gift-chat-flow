import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface RfvBadgeProps {
  r: number | null | undefined;
  f: number | null | undefined;
  v: number | null | undefined;
  className?: string;
}

export function rfvScoreColor(media: number): string {
  // Verde (alto), amarelo (médio), vermelho (baixo) — usando tokens semânticos
  if (media >= 4) return "bg-green-600 text-white hover:bg-green-700";
  if (media >= 2.5) return "bg-yellow-500 text-white hover:bg-yellow-600";
  return "bg-red-600 text-white hover:bg-red-700";
}

export default function RfvBadge({ r, f, v, className }: RfvBadgeProps) {
  if (r == null && f == null && v == null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const partes = [r ?? "-", f ?? "-", v ?? "-"];
  const nums = [r, f, v].filter((n): n is number => typeof n === "number");
  const media = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
  return (
    <Badge className={cn("font-mono", rfvScoreColor(media), className)} title={`R=${r ?? "-"} F=${f ?? "-"} V=${v ?? "-"}`}>
      {partes.join("-")}
    </Badge>
  );
}
