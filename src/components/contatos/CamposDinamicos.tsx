import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface CampoConfig {
  id: string;
  nome: string;
  tipo: string;
  opcoes: string[];
  obrigatorio: boolean;
  ativo: boolean;
}

interface CamposDinamicosProps {
  campos: CampoConfig[];
  valores: Record<string, any>;
  onChange: (valores: Record<string, any>) => void;
}

function campoKey(nome: string) {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export default function CamposDinamicos({ campos, valores, onChange }: CamposDinamicosProps) {
  const ativos = campos.filter((c) => c.ativo);
  if (!ativos.length) return null;

  const updateValue = (key: string, value: any) => {
    onChange({ ...valores, [key]: value });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-muted-foreground">Campos Personalizados</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {ativos.map((campo) => {
          const key = campoKey(campo.nome);
          const value = valores[key] ?? "";

          switch (campo.tipo) {
            case "texto":
              return (
                <div key={campo.id} className="space-y-2">
                  <Label>{campo.nome}{campo.obrigatorio ? " *" : ""}</Label>
                  <Input
                    value={value}
                    onChange={(e) => updateValue(key, e.target.value)}
                    required={campo.obrigatorio}
                  />
                </div>
              );
            case "numero":
              return (
                <div key={campo.id} className="space-y-2">
                  <Label>{campo.nome}{campo.obrigatorio ? " *" : ""}</Label>
                  <Input
                    type="number"
                    value={value}
                    onChange={(e) => updateValue(key, e.target.value)}
                    required={campo.obrigatorio}
                  />
                </div>
              );
            case "data":
              return (
                <div key={campo.id} className="space-y-2">
                  <Label>{campo.nome}{campo.obrigatorio ? " *" : ""}</Label>
                  <Input
                    type="date"
                    value={value}
                    onChange={(e) => updateValue(key, e.target.value)}
                    required={campo.obrigatorio}
                  />
                </div>
              );
            case "selecao":
              return (
                <div key={campo.id} className="space-y-2">
                  <Label>{campo.nome}{campo.obrigatorio ? " *" : ""}</Label>
                  <Select value={value || ""} onValueChange={(v) => updateValue(key, v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {(campo.opcoes || []).map((opt) => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            case "booleano":
              return (
                <div key={campo.id} className="flex items-center gap-2 pt-6">
                  <Checkbox
                    checked={!!value}
                    onCheckedChange={(checked) => updateValue(key, !!checked)}
                  />
                  <Label>{campo.nome}</Label>
                </div>
              );
            default:
              return null;
          }
        })}
      </div>
    </div>
  );
}

export { campoKey };
