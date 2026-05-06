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
import { Building2, Users, Wifi, Plus, Trash2, Copy, Loader2, Settings2, FolderTree, ArrowLeftRight, Mail, Share2, MessageCircle, Check, Link as LinkIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

interface EmpresaProps {
  initialTab?: string;
}

export default function Empresa({ initialTab = "dados" }: EmpresaProps) {
  const { profile, user, hasRole, tenants, switchTenant } = useAuth();
  const { toast } = useToast();
  const isAdmin = hasRole("admin_tenant") || hasRole("admin_master");
  const isMaster = hasRole("admin_master");

  // Dados da Empresa
  const [tenantData, setTenantData] = useState({ nome: "", cnpj: "", telefone_empresa: "" });
  const [savingTenant, setSavingTenant] = useState(false);

  // E-mail config (per tenant)
  const [emailConfig, setEmailConfig] = useState({
    email_remetente_nome: "",
    email_remetente_local: "contato",
    email_reply_to: "",
    email_assinatura: "",
  });
  const [savingEmail, setSavingEmail] = useState(false);

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
  const [inviteResult, setInviteResult] = useState<{ token: string; email: string; role: string; expires_at: string } | null>(null);

  // Instâncias
  const [instances, setInstances] = useState<any[]>([]);
  const [loadingInstances, setLoadingInstances] = useState(true);
  const [cloudConfig, setCloudConfig] = useState<any>(null);

  // Departamentos (for team select)
  const [departamentos, setDepartamentos] = useState<any[]>([]);

  // Remoção de membro
  const [removingMember, setRemovingMember] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<{ id: string; nome: string } | null>(null);
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);

  // Nova empresa
  const [showNewTenant, setShowNewTenant] = useState(false);
  const [newTenantName, setNewTenantName] = useState("");
  const [creatingTenant, setCreatingTenant] = useState(false);

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
      .select("nome, cnpj, telefone_empresa, email_remetente_nome, email_remetente_local, email_reply_to, email_assinatura")
      .eq("id", tenantId!)
      .single();
    if (data) {
      setTenantData({
        nome: data.nome || "",
        cnpj: (data as any).cnpj || "",
        telefone_empresa: (data as any).telefone_empresa || "",
      });
      setEmailConfig({
        email_remetente_nome: (data as any).email_remetente_nome || "",
        email_remetente_local: (data as any).email_remetente_local || "contato",
        email_reply_to: (data as any).email_reply_to || "",
        email_assinatura: (data as any).email_assinatura || "",
      });
    }
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

  const saveEmailConfig = async () => {
    setSavingEmail(true);
    const { error } = await supabase
      .from("tenants")
      .update(emailConfig as any)
      .eq("id", tenantId!);
    setSavingEmail(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Configuração de e-mail salva!" });
    }
  };

  const loadTeam = async () => {
    setLoadingTeam(true);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, nome, departamento, departamento_id, apelido, mostrar_apelido")
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
    const { data, error } = await supabase
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
    } else if (data) {
      const d = data as any;
      setInviteResult({ token: d.token, email: d.email, role: d.role, expires_at: d.expires_at });
      loadConvites();
    }
  };

  const buildInviteLink = (token: string) =>
    `${window.location.origin}/login?convite=${token}`;

  const buildShareMessage = (link: string) => {
    const empresa = tenantData.nome || "nossa equipe";
    return `Olá! Você foi convidado para participar da equipe da ${empresa} no PR Bot.\nAcesse o link abaixo para criar sua conta:\n${link}`;
  };

  const copyInviteLink = (token: string) => {
    navigator.clipboard.writeText(buildInviteLink(token));
    toast({ title: "Link copiado!" });
  };

  const shareWhatsApp = (token: string) => {
    const msg = buildShareMessage(buildInviteLink(token));
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const shareEmail = (token: string, email: string) => {
    const link = buildInviteLink(token);
    const empresa = tenantData.nome || "nossa equipe";
    const subject = `Convite para a equipe da ${empresa}`;
    const body = buildShareMessage(link);
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const closeInviteDialog = () => {
    setShowInvite(false);
    setInviteEmail("");
    setInviteRole("atendente");
    setInviteResult(null);
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

    const { data: cloud } = await supabase
      .from("whatsapp_cloud_config" as any)
      .select("id, phone_number_id, display_phone, status, updated_at")
      .eq("tenant_id", tenantId!)
      .maybeSingle();
    setCloudConfig(cloud || null);

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

  const handleUpdateRole = async (memberId: string, newRole: string) => {
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

      <Tabs defaultValue={initialTab}>
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
            <TabsTrigger value="email" className="gap-2">
              <Mail className="h-4 w-4" /> E-mail
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="campos" className="gap-2">
              <Settings2 className="h-4 w-4" /> Campos
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="departamentos" className="gap-2">
              <FolderTree className="h-4 w-4" /> Deptos
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="respostas" className="gap-2">
              <Settings2 className="h-4 w-4" /> Respostas
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="empresas" className="gap-2">
              <ArrowLeftRight className="h-4 w-4" /> Empresas
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
                      <TableHead>Apelido</TableHead>
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
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {canManage || isSelf ? (
                                <Input
                                  className="h-8 w-[120px]"
                                  placeholder="Apelido"
                                  defaultValue={member.apelido || ""}
                                  onBlur={async (e) => {
                                    const val = e.target.value.trim();
                                    if (val !== (member.apelido || "")) {
                                      await supabase.from("profiles").update({ apelido: val || null } as any).eq("id", member.id);
                                      loadTeam();
                                    }
                                  }}
                                />
                              ) : (
                                <span>{member.apelido || "—"}</span>
                              )}
                              {(canManage || isSelf) && (
                                <label className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={member.mostrar_apelido || false}
                                    onChange={async (e) => {
                                      await supabase.from("profiles").update({ mostrar_apelido: e.target.checked } as any).eq("id", member.id);
                                      loadTeam();
                                    }}
                                    className="rounded"
                                  />
                                  Mostrar
                                </label>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {canManage ? (
                              <Select
                                value={member.departamento_id || "none"}
                                onValueChange={(val) => handleUpdateDepartamento(member.id, val === "none" ? null : val)}
                              >
                                <SelectTrigger className="w-[140px] h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">Nenhum</SelectItem>
                                  {departamentos.map(d => (
                                    <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span>{departamentos.find(d => d.id === member.departamento_id)?.nome || member.departamento || "—"}</span>
                            )}
                          </TableCell>
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
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button size="sm" variant="outline">
                                  <Share2 className="h-4 w-4 mr-1" /> Compartilhar
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent align="end" className="w-56 p-1">
                                <button
                                  className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-accent"
                                  onClick={() => copyInviteLink(c.token)}
                                >
                                  <Copy className="h-4 w-4" /> Copiar link
                                </button>
                                <button
                                  className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-accent"
                                  onClick={() => shareWhatsApp(c.token)}
                                >
                                  <MessageCircle className="h-4 w-4" /> Enviar por WhatsApp
                                </button>
                                <button
                                  className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-accent"
                                  onClick={() => shareEmail(c.token, c.email)}
                                >
                                  <Mail className="h-4 w-4" /> Enviar por e-mail
                                </button>
                              </PopoverContent>
                            </Popover>
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
        <TabsContent value="instancias" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle>Z-API (não-oficial)</CardTitle>
                  <CardDescription>Conexões Z-API vinculadas à sua empresa</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => window.location.href = "/configuracoes/zapi"}>
                  <Settings2 className="h-4 w-4 mr-1" /> Configurar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingInstances ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : instances.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Nenhuma instância configurada.</p>
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

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle>WhatsApp Oficial (Cloud API)</CardTitle>
                  <CardDescription>Número oficial conectado via Meta WhatsApp Business</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => window.location.href = "/configuracoes/whatsapp-oficial"}>
                  <Settings2 className="h-4 w-4 mr-1" /> Configurar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingInstances ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : !cloudConfig ? (
                <p className="text-sm text-muted-foreground py-4">Nenhum número oficial configurado.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Phone Number ID</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Última atualização</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-mono text-sm">{cloudConfig.phone_number_id}</TableCell>
                      <TableCell className="text-sm">{cloudConfig.display_phone || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={cloudConfig.status === "conectado" ? "default" : cloudConfig.status === "erro" ? "destructive" : "secondary"}>
                          {cloudConfig.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(cloudConfig.updated_at).toLocaleDateString("pt-BR")}
                      </TableCell>
                    </TableRow>
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

        {/* ── Departamentos ── */}
        {isAdmin && (
          <TabsContent value="departamentos">
            <DepartamentosConfig />
          </TabsContent>
        )}

        {/* ── Respostas Rápidas ── */}
        {isAdmin && (
          <TabsContent value="respostas">
            <RespostasRapidasConfig />
          </TabsContent>
        )}
        {/* ── E-mail (remetente por empresa) ── */}
        {isAdmin && (
          <TabsContent value="email">
            <Card>
              <CardHeader>
                <CardTitle>Configuração de E-mail</CardTitle>
                <CardDescription>
                  Personalize como os e-mails enviados pela sua empresa aparecerão para os destinatários.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 max-w-xl">
                <div className="space-y-2">
                  <Label>Nome do Remetente</Label>
                  <Input
                    value={emailConfig.email_remetente_nome}
                    onChange={(e) => setEmailConfig({ ...emailConfig, email_remetente_nome: e.target.value })}
                    placeholder="Ex: Loja XYZ"
                  />
                  <p className="text-xs text-muted-foreground">
                    Nome que aparecerá no campo "De" da caixa de entrada.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Endereço Local</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={emailConfig.email_remetente_local}
                      onChange={(e) => setEmailConfig({ ...emailConfig, email_remetente_local: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "") })}
                      placeholder="contato"
                      className="max-w-[180px]"
                    />
                    <span className="text-sm text-muted-foreground">@seudominio.com</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Parte antes do @ no endereço de envio (ex: contato, ola, marketing).
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>E-mail para resposta (Reply-To)</Label>
                  <Input
                    type="email"
                    value={emailConfig.email_reply_to}
                    onChange={(e) => setEmailConfig({ ...emailConfig, email_reply_to: e.target.value })}
                    placeholder="seuemail@gmail.com"
                  />
                  <p className="text-xs text-muted-foreground">
                    Quando seus contatos responderem ao e-mail enviado pela campanha, a resposta vai pra esse endereço. Pode ser seu Gmail/Outlook normal. Deixe em branco para usar o e-mail do remetente.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Assinatura (HTML opcional)</Label>
                  <textarea
                    className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                    value={emailConfig.email_assinatura}
                    onChange={(e) => setEmailConfig({ ...emailConfig, email_assinatura: e.target.value })}
                    placeholder={'<strong>Loja XYZ</strong><br/>(11) 99999-9999<br/><a href="https://lojaxyz.com">lojaxyz.com</a>'}
                  />
                  <p className="text-xs text-muted-foreground">
                    Aparece no rodapé de todas as campanhas de e-mail desta empresa.
                  </p>
                </div>
                <Button onClick={saveEmailConfig} disabled={savingEmail}>
                  {savingEmail ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Salvando...</> : "Salvar"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* ── Empresas (multi-tenant) ── */}
        {isAdmin && (
          <TabsContent value="empresas" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Empresas</CardTitle>
                  <CardDescription>Gerencie e alterne entre suas empresas</CardDescription>
                </div>
                <Button size="sm" onClick={() => setShowNewTenant(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Nova Empresa
                </Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-32">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tenants.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">
                          {t.nome}
                          {t.id === tenantId && (
                            <Badge variant="default" className="ml-2 text-xs">Ativa</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">Ativo</Badge>
                        </TableCell>
                        <TableCell>
                          {t.id !== tenantId && (
                            <Button size="sm" variant="outline" onClick={() => switchTenant(t.id)}>
                              <ArrowLeftRight className="h-3 w-3 mr-1" /> Alternar
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
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

      {/* Dialog Nova Empresa */}
      <Dialog open={showNewTenant} onOpenChange={setShowNewTenant}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Empresa</DialogTitle>
            <DialogDescription>Crie uma nova empresa no sistema</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome da Empresa</Label>
              <Input
                value={newTenantName}
                onChange={(e) => setNewTenantName(e.target.value)}
                placeholder="Nome da empresa"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewTenant(false)}>Cancelar</Button>
            <Button
              onClick={async () => {
                if (!newTenantName.trim() || !user) return;
                setCreatingTenant(true);
                const { data, error } = await supabase.functions.invoke("criar-tenant", {
                  body: { nome: newTenantName.trim() },
                });
                if (error || (data as any)?.error) {
                  toast({
                    title: "Erro ao criar empresa",
                    description: (data as any)?.error || error?.message || "Falha desconhecida",
                    variant: "destructive",
                  });
                  setCreatingTenant(false);
                  return;
                }
                toast({ title: "Empresa criada com sucesso!" });
                setShowNewTenant(false);
                setNewTenantName("");
                setCreatingTenant(false);
                window.location.reload();
              }}
              disabled={creatingTenant || !newTenantName.trim()}
            >
              {creatingTenant ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Criar Empresa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
