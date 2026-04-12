import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Building2, Users, Wifi, Plus, Trash2, Copy, Loader2, Settings2, FolderTree } from "lucide-react";
import CamposPersonalizadosConfig from "@/components/contatos/CamposPersonalizadosConfig";
import RespostasRapidasConfig from "@/components/conversas/RespostasRapidasConfig";
import DepartamentosConfig from "@/components/empresa/DepartamentosConfig";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const roleLabels: Record<string, string> = {
  admin_master: "Admin Master",
  admin_tenant: "Admin",
  atendente: "Atendente",
  caixa: "Caixa",
};

export default function Empresa() {
  const { profile, user, hasRole } = useAuth();
  const { toast } = useToast();
  const isAdmin = hasRole("admin_tenant") || hasRole("admin_master");

  // Dados da Empresa
  const [tenantData, setTenantData] = useState({ nome: "", cnpj: "", telefone_empresa: "" });
  const [savingTenant, setSavingTenant] = useState(false);

  // Equipe
  const [team, setTeam] = useState<any[]>([]);
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [loadingTeam, setLoadingTeam] = useState(true);

  // Convites
  const [convites, setConvites] = useState<any[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("atendente");
  const [sendingInvite, setSendingInvite] = useState(false);

  // Instâncias
  const [instances, setInstances] = useState<any[]>([]);
  const [loadingInstances, setLoadingInstances] = useState(true);

  // Departamentos (for team select)
  const [departamentos, setDepartamentos] = useState<any[]>([]);

  // Remoção de membro
  const [removingMember, setRemovingMember] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<{ id: string; nome: string } | null>(null);
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);

  const tenantId = profile?.tenant_id;

  useEffect(() => {
    if (!tenantId) return;
    loadTenantData();
    loadTeam();
    loadConvites();
    loadInstances();
    loadDepartamentos();
  }, [tenantId]);

  const loadTenantData = async () => {
    const { data } = await supabase
      .from("tenants")
      .select("nome, cnpj, telefone_empresa")
      .eq("id", tenantId!)
      .single();
    if (data) setTenantData({
      nome: data.nome || "",
      cnpj: (data as any).cnpj || "",
      telefone_empresa: (data as any).telefone_empresa || "",
    });
  };

  const saveTenantData = async () => {
    setSavingTenant(true);
    const { error } = await supabase
      .from("tenants")
      .update(tenantData as any)
      .eq("id", tenantId!);
    setSavingTenant(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Dados salvos com sucesso!" });
    }
  };

  const loadTeam = async () => {
    setLoadingTeam(true);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, nome, departamento, departamento_id")
      .eq("tenant_id", tenantId!);

    if (profiles) {
      setTeam(profiles);
      const { data: allRoles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", profiles.map((p) => p.id));
      const roleMap: Record<string, string> = {};
      allRoles?.forEach((r) => { roleMap[r.user_id] = r.role; });
      setRoles(roleMap);
    }
    setLoadingTeam(false);
  };

  const loadConvites = async () => {
    const { data } = await supabase
      .from("convites" as any)
      .select("*")
      .eq("tenant_id", tenantId!)
      .eq("status", "pendente")
      .order("created_at", { ascending: false });
    setConvites(data || []);
  };

  const handleInvite = async () => {
    if (!inviteEmail || !user) return;
    setSendingInvite(true);
    const { error } = await supabase
      .from("convites" as any)
      .insert({
        tenant_id: tenantId!,
        email: inviteEmail.toLowerCase().trim(),
        role: inviteRole,
        convidado_por: user.id,
      } as any)
      .select()
      .single();

    setSendingInvite(false);
    if (error) {
      toast({ title: "Erro ao convidar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Convite criado!" });
      setShowInvite(false);
      setInviteEmail("");
      loadConvites();
    }
  };

  const copyInviteLink = (token: string) => {
    const link = `${window.location.origin}/login?convite=${token}`;
    navigator.clipboard.writeText(link);
    toast({ title: "Link copiado!" });
  };

  const deleteConvite = async (id: string) => {
    await supabase.from("convites" as any).delete().eq("id", id);
    loadConvites();
  };

  const loadInstances = async () => {
    setLoadingInstances(true);
    const { data } = await supabase
      .from("zapi_config")
      .select("id, instance_id, status, updated_at")
      .eq("tenant_id", tenantId!);
    setInstances(data || []);
    setLoadingInstances(false);
  };

  const loadDepartamentos = async () => {
    const { data } = await supabase
      .from("departamentos")
      .select("id, nome")
      .eq("tenant_id", tenantId!)
      .eq("ativo", true)
      .order("nome");
    setDepartamentos(data || []);
  };

  const handleUpdateDepartamento = async (memberId: string, departamentoId: string | null) => {
    const { error } = await supabase
      .from("profiles")
      .update({ departamento_id: departamentoId } as any)
      .eq("id", memberId);
    if (error) {
      toast({ title: "Erro ao atualizar departamento", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Departamento atualizado!" });
      loadTeam();
    }
  };


    setUpdatingRole(memberId);
    const { data, error } = await supabase.functions.invoke("gerenciar-membro", {
      body: { action: "update_role", user_id: memberId, new_role: newRole },
    });
    setUpdatingRole(null);
    if (error || data?.error) {
      toast({ title: "Erro ao alterar função", description: data?.error || error?.message, variant: "destructive" });
    } else {
      toast({ title: "Função alterada com sucesso!" });
      setRoles((prev) => ({ ...prev, [memberId]: newRole }));
    }
  };

  const handleRemoveMember = async () => {
    if (!memberToRemove) return;
    setRemovingMember(memberToRemove.id);
    const { data, error } = await supabase.functions.invoke("gerenciar-membro", {
      body: { action: "remove_member", user_id: memberToRemove.id },
    });
    setRemovingMember(null);
    setMemberToRemove(null);
    if (error || data?.error) {
      toast({ title: "Erro ao remover membro", description: data?.error || error?.message, variant: "destructive" });
    } else {
      toast({ title: "Membro removido com sucesso!" });
      loadTeam();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Empresa</h1>
        <p className="text-muted-foreground">Gerencie os dados da empresa, equipe e instâncias</p>
      </div>

      <Tabs defaultValue="dados">
        <TabsList>
          <TabsTrigger value="dados" className="gap-2">
            <Building2 className="h-4 w-4" /> Dados
          </TabsTrigger>
          <TabsTrigger value="equipe" className="gap-2">
            <Users className="h-4 w-4" /> Equipe
          </TabsTrigger>
          <TabsTrigger value="instancias" className="gap-2">
            <Wifi className="h-4 w-4" /> Instâncias
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="campos" className="gap-2">
              <Settings2 className="h-4 w-4" /> Campos
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="respostas" className="gap-2">
              <Settings2 className="h-4 w-4" /> Respostas
            </TabsTrigger>
          )}
        </TabsList>

        {/* ── Dados da Empresa ── */}
        <TabsContent value="dados">
          <Card>
            <CardHeader>
              <CardTitle>Dados da Empresa</CardTitle>
              <CardDescription>Informações da sua empresa no sistema</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-w-md">
              <div className="space-y-2">
                <Label>Nome da Empresa</Label>
                <Input
                  value={tenantData.nome}
                  onChange={(e) => setTenantData({ ...tenantData, nome: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>CNPJ</Label>
                <Input
                  value={tenantData.cnpj}
                  onChange={(e) => setTenantData({ ...tenantData, cnpj: e.target.value })}
                  placeholder="00.000.000/0000-00"
                />
              </div>
              <div className="space-y-2">
                <Label>Telefone da Empresa</Label>
                <Input
                  value={tenantData.telefone_empresa}
                  onChange={(e) => setTenantData({ ...tenantData, telefone_empresa: e.target.value })}
                  placeholder="(00) 00000-0000"
                />
              </div>
              <Button onClick={saveTenantData} disabled={savingTenant}>
                {savingTenant ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Salvando...</> : "Salvar"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Equipe ── */}
        <TabsContent value="equipe" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Equipe</CardTitle>
                <CardDescription>Membros da sua empresa</CardDescription>
              </div>
              {isAdmin && (
                <Button size="sm" onClick={() => setShowInvite(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Convidar
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {loadingTeam ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Departamento</TableHead>
                      <TableHead>Função</TableHead>
                      {isAdmin && <TableHead className="w-20">Ações</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {team.map((member) => {
                      const memberRole = roles[member.id] || "";
                      const isSelf = member.id === user?.id;
                      const isTargetMaster = memberRole === "admin_master";
                      const canManage = isAdmin && !isSelf && !isTargetMaster;

                      return (
                        <TableRow key={member.id}>
                          <TableCell className="font-medium">
                            {member.nome || "Sem nome"}
                            {isSelf && <Badge variant="outline" className="ml-2 text-xs">Você</Badge>}
                          </TableCell>
                          <TableCell>{member.departamento || "—"}</TableCell>
                          <TableCell>
                            {canManage ? (
                              <Select
                                value={memberRole}
                                onValueChange={(val) => handleUpdateRole(member.id, val)}
                                disabled={updatingRole === member.id}
                              >
                                <SelectTrigger className="w-[140px] h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="admin_tenant">Admin</SelectItem>
                                  <SelectItem value="atendente">Atendente</SelectItem>
                                  <SelectItem value="caixa">Caixa</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge variant="secondary">{roleLabels[memberRole] || memberRole || "—"}</Badge>
                            )}
                          </TableCell>
                          {isAdmin && (
                            <TableCell>
                              {canManage && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => setMemberToRemove({ id: member.id, nome: member.nome || "Sem nome" })}
                                  disabled={removingMember === member.id}
                                >
                                  {removingMember === member.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  )}
                                </Button>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Convites pendentes */}
          {convites.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Convites Pendentes</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Função</TableHead>
                      <TableHead>Expira em</TableHead>
                      <TableHead className="w-24">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {convites.map((c: any) => (
                      <TableRow key={c.id}>
                        <TableCell>{c.email}</TableCell>
                        <TableCell><Badge variant="outline">{roleLabels[c.role] || c.role}</Badge></TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(c.expires_at).toLocaleDateString("pt-BR")}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" onClick={() => copyInviteLink(c.token)}>
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => deleteConvite(c.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Instâncias ── */}
        <TabsContent value="instancias">
          <Card>
            <CardHeader>
              <CardTitle>Instâncias WhatsApp</CardTitle>
              <CardDescription>Conexões Z-API vinculadas à sua empresa</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingInstances ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : instances.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Nenhuma instância configurada. Acesse Configurações → Z-API para adicionar.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Instance ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Última atualização</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {instances.map((inst) => (
                      <TableRow key={inst.id}>
                        <TableCell className="font-mono text-sm">{inst.instance_id}</TableCell>
                        <TableCell>
                          <Badge variant={inst.status === "conectado" ? "default" : "secondary"}>
                            {inst.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(inst.updated_at).toLocaleDateString("pt-BR")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Campos Personalizados ── */}
        {isAdmin && (
          <TabsContent value="campos">
            <CamposPersonalizadosConfig />
          </TabsContent>
        )}

        {/* ── Respostas Rápidas ── */}
        {isAdmin && (
          <TabsContent value="respostas">
            <RespostasRapidasConfig />
          </TabsContent>
        )}
      </Tabs>

      {/* Dialog de convite */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convidar Membro</DialogTitle>
            <DialogDescription>Envie um convite para um novo membro da equipe</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="email@exemplo.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Função</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="atendente">Atendente</SelectItem>
                  <SelectItem value="caixa">Caixa</SelectItem>
                  <SelectItem value="admin_tenant">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvite(false)}>Cancelar</Button>
            <Button onClick={handleInvite} disabled={sendingInvite || !inviteEmail}>
              {sendingInvite ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Criar Convite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog de remoção */}
      <AlertDialog open={!!memberToRemove} onOpenChange={(open) => !open && setMemberToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover membro</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover <strong>{memberToRemove?.nome}</strong> da equipe? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveMember} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
