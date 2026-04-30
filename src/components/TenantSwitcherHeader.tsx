import { useState } from "react";
import { Building2, ChevronsUpDown, Plus, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export function TenantSwitcherHeader() {
  const { profile, tenants, switchTenant, hasRole, user } = useAuth();
  const { toast } = useToast();
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const activeTenant = tenants.find((t) => t.id === profile?.tenant_id);
  const canCreate = hasRole("admin_tenant") || hasRole("admin_master");

  const handleCreate = async () => {
    if (!newName.trim() || !user) return;
    setCreating(true);
    const { data, error } = await supabase.functions.invoke("criar-tenant", {
      body: { nome: newName.trim() },
    });
    if (error || (data as any)?.error) {
      toast({
        title: "Erro ao criar empresa",
        description: (data as any)?.error || error?.message || "Falha desconhecida",
        variant: "destructive",
      });
      setCreating(false);
      return;
    }
    toast({ title: "Empresa criada com sucesso!" });
    setShowNew(false);
    setNewName("");
    setCreating(false);
    window.location.reload();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 max-w-[240px]">
            <Building2 className="h-4 w-4 text-primary shrink-0" />
            <span className="truncate text-sm font-medium">
              {activeTenant?.nome || "Empresa"}
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {tenants.map((t) => (
            <DropdownMenuItem
              key={t.id}
              onClick={() => t.id !== profile?.tenant_id && switchTenant(t.id)}
              className="flex items-center justify-between"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Building2 className="h-4 w-4 shrink-0" />
                <span className="truncate">{t.nome}</span>
              </div>
              {t.id === profile?.tenant_id && <Check className="h-4 w-4 text-primary shrink-0" />}
            </DropdownMenuItem>
          ))}
          {canCreate && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowNew(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Nova empresa
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Empresa</DialogTitle>
            <DialogDescription>Crie uma nova empresa. Você será automaticamente vinculado a ela.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Nome da Empresa</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nome da empresa"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Criar Empresa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
