import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Plus, Search, Trash2, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

const CATEGORIAS = [
  "geral",
  "produtos",
  "politicas",
  "horarios",
  "pagamentos",
  "faq",
];

const CATEGORIA_LABELS: Record<string, string> = {
  geral: "Geral",
  produtos: "Produtos/Serviços",
  politicas: "Políticas",
  horarios: "Horários/Localização",
  pagamentos: "Pagamentos",
  faq: "FAQ",
};

interface Artigo {
  id: string;
  tenant_id: string;
  titulo: string;
  conteudo: string;
  categoria: string | null;
  tags: string[] | null;
  ativo: boolean | null;
  created_at: string;
  updated_at: string;
}

export default function Conhecimento() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<Artigo | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [busca, setBusca] = useState("");

  // Form state
  const [titulo, setTitulo] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [categoria, setCategoria] = useState("geral");
  const [tagsInput, setTagsInput] = useState("");
  const [ativo, setAtivo] = useState(true);

  const { data: artigos, isLoading } = useQuery({
    queryKey: ["conhecimento-base"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conhecimento_base")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Artigo[];
    },
    enabled: !!profile?.tenant_id,
  });

  const filtered = artigos?.filter(
    (a) =>
      a.titulo.toLowerCase().includes(busca.toLowerCase()) ||
      a.conteudo.toLowerCase().includes(busca.toLowerCase())
  );

  const loadForm = (artigo: Artigo) => {
    setSelected(artigo);
    setIsNew(false);
    setTitulo(artigo.titulo);
    setConteudo(artigo.conteudo);
    setCategoria(artigo.categoria || "geral");
    setTagsInput((artigo.tags || []).join(", "));
    setAtivo(artigo.ativo !== false);
  };

  const resetForm = () => {
    setSelected(null);
    setIsNew(false);
    setTitulo("");
    setConteudo("");
    setCategoria("geral");
    setTagsInput("");
    setAtivo(true);
  };

  const startNew = () => {
    resetForm();
    setIsNew(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const payload = {
        titulo,
        conteudo,
        categoria,
        tags,
        ativo,
        tenant_id: profile!.tenant_id!,
      };

      if (isNew) {
        const { error } = await supabase.from("conhecimento_base").insert(payload);
        if (error) throw error;
      } else if (selected) {
        const { error } = await supabase
          .from("conhecimento_base")
          .update({ titulo, conteudo, categoria, tags, ativo })
          .eq("id", selected.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conhecimento-base"] });
      toast({ title: isNew ? "Artigo criado" : "Artigo atualizado" });
      resetForm();
    },
    onError: (e: Error) => {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("conhecimento_base").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conhecimento-base"] });
      toast({ title: "Artigo excluído" });
      resetForm();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from("conhecimento_base")
        .update({ ativo })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conhecimento-base"] });
    },
  });

  const showEditor = isNew || selected;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6" /> Base de Conhecimento
          </h1>
          <p className="text-muted-foreground text-sm">
            Cadastre informações que a IA usará para responder automaticamente.
          </p>
        </div>
        <Button onClick={startNew}>
          <Plus className="h-4 w-4 mr-1" /> Novo Artigo
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista */}
        <div className="lg:col-span-1 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar artigos..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-9"
            />
          </div>

          <ScrollArea className="h-[calc(100vh-280px)]">
            <div className="space-y-2 pr-2">
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))
                : filtered?.map((artigo) => (
                    <Card
                      key={artigo.id}
                      className={`cursor-pointer transition-colors hover:border-primary/50 ${
                        selected?.id === artigo.id ? "border-primary" : ""
                      } ${!artigo.ativo ? "opacity-60" : ""}`}
                      onClick={() => loadForm(artigo)}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">{artigo.titulo}</p>
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                              {artigo.conteudo}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <Badge variant="secondary" className="text-[10px]">
                              {CATEGORIA_LABELS[artigo.categoria || "geral"] || artigo.categoria}
                            </Badge>
                            <Switch
                              checked={artigo.ativo !== false}
                              onCheckedChange={(v) =>
                                toggleMutation.mutate({ id: artigo.id, ativo: v })
                              }
                              onClick={(e) => e.stopPropagation()}
                              className="scale-75"
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
              {filtered?.length === 0 && !isLoading && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhum artigo encontrado.
                </p>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Editor */}
        <div className="lg:col-span-2">
          {showEditor ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-4">
                <CardTitle className="text-lg">
                  {isNew ? "Novo Artigo" : "Editar Artigo"}
                </CardTitle>
                <Button variant="ghost" size="icon" onClick={resetForm}>
                  <X className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Título</Label>
                  <Input
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                    placeholder="Ex: Horário de funcionamento"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Conteúdo</Label>
                  <Textarea
                    value={conteudo}
                    onChange={(e) => setConteudo(e.target.value)}
                    placeholder="Escreva aqui as informações que a IA deve saber..."
                    className="min-h-[200px]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Categoria</Label>
                    <Select value={categoria} onValueChange={setCategoria}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIAS.map((c) => (
                          <SelectItem key={c} value={c}>
                            {CATEGORIA_LABELS[c]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Tags (separadas por vírgula)</Label>
                    <Input
                      value={tagsInput}
                      onChange={(e) => setTagsInput(e.target.value)}
                      placeholder="troca, devolução, garantia"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Switch checked={ativo} onCheckedChange={setAtivo} />
                  <Label>Artigo ativo</Label>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={() => saveMutation.mutate()}
                    disabled={!titulo.trim() || !conteudo.trim() || saveMutation.isPending}
                  >
                    {saveMutation.isPending ? "Salvando..." : "Salvar"}
                  </Button>

                  {selected && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="icon">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir artigo?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta ação não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteMutation.mutate(selected.id)}
                          >
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground">
              <BookOpen className="h-12 w-12 mb-4 opacity-40" />
              <p>Selecione um artigo ou crie um novo</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
