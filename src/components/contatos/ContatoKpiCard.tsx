import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ContatoKpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  iconColorClass?: string;
}

export function ContatoKpiCard({ icon: Icon, label, value, iconColorClass = "text-primary bg-primary/10" }: ContatoKpiCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
      <div className={cn("h-10 w-10 rounded-full flex items-center justify-center shrink-0", iconColorClass)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-base font-bold text-foreground leading-tight truncate">{value}</div>
        <div className="text-xs text-muted-foreground truncate">{label}</div>
      </div>
    </div>
  );
}
