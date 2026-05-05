import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Loader2, RefreshCw, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import { mascararCPF } from "@/lib/br-format";

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "R$ 0,00";
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCpfDisplay(v: string | null | undefined): string {
  if (!v) return "—";
  const d = v.replace(/\D/g, "");
  if (d.length === 11) return mascararCPF(d);
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  return v;
}

const PAGE_SIZE = 50;

type Tipo = "consignado" | "moeda_pr";

async function parsePlanilha(file: File) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: true,
    cellFormula: false,
    cellHTML: false,
    cellNF: false,
    cellStyles: false,
    dense: true,
  });

  const firstSheet = workbook.SheetNames[0];
  const sheet = firstSheet ? workbook.Sheets[firstSheet] : undefined;
  if (!sheet) throw new Error("A planilha está vazia ou inválida");

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: true,
  });

  if (rows.length === 0) throw new Error("A planilha não possui linhas para importar");
  return rows;
}

function UploadCard({
  tipo,
  onDone,
  podeUpload,
}: {
  tipo: Tipo;
  onDone: () => void;
  podeUpload: boolean;
}) {
  const [enviando, setEnviando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: ultimoLog } = useQuery({
    queryKey: ["saldos-upload-log", tipo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("saldos_uploads_log")
        .select("*")
        .eq("tipo", tipo)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const handleFile = async (file: File) => {
    if (!podeUpload) {
      toast.error("Apenas administradores podem importar planilhas");
      return;
    }
    setEnviando(true);
    try {
      const linhas = await parsePlanilha(file);

      const { data, error } = await supabase.functions.invoke("saldos-importar", {
        body: {
          tipo,
          arquivo_nome: file.name,
          linhas,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) {
        throw new Error((data as any).detalhe || (data as any).error);
      }
      toast.success(`Importação concluída: ${(data as any).total} registros`);
      onDone();
    } catch (e: any) {
      toast.error(`Falha ao importar: ${e.message ?? e}`);
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const tituloTipo = tipo === "consignado" ? "Saldo Consignado (Fornecedores)" : "Saldo Moeda PR (Clientes)";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          {tituloTipo}
        </CardTitle>
        <CardDescription>
          Faça upload do arquivo .xlsx exportado do sistema externo. Cada upload <strong>substitui</strong> todos os
          dados anteriores deste tipo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            disabled={!podeUpload || enviando}
          />
          <Button
            onClick={() => inputRef.current?.click()}
            disabled={!podeUpload || enviando}
          >
            {enviando ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Selecionar planilha .xlsx
              </>
            )}
          </Button>

          {ultimoLog ? (
            <div className="text-sm text-muted-foreground">
              Último upload: <strong>{format(new Date(ultimoLog.created_at), "dd/MM/yyyy HH:mm")}</strong>
              {" · "}
              {ultimoLog.total_linhas} registros
              {ultimoLog.usuario_nome ? ` · por ${ultimoLog.usuario_nome}` : ""}
              {ultimoLog.arquivo_nome ? ` · ${ultimoLog.arquivo_nome}` : ""}
            </div>
          ) : (
            <Badge variant="outline">Nenhum upload realizado</Badge>
          )}
        </div>
        {!podeUpload && (
          <p className="text-xs text-muted-foreground">
            Apenas administradores podem importar planilhas.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ConsignadoTable() {
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["saldos-consignado-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("saldos_consignado")
        .select("*")
        .order("nome", { ascending: true })
        .limit(10000);
      if (error) throw error;
      return data || [];
    },
  });

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const onlyDigits = termo.replace(/\D/g, "");
    if (!termo) return data || [];
    return (data || []).filter((r: any) => {
      const nome = (r.nome || "").toLowerCase();
      const cpf = (r.cpf_cnpj || "").toLowerCase();
      const contrato = (r.numero_contrato || "").toLowerCase();
      return (
        nome.includes(termo) ||
        contrato.includes(termo) ||
        (onlyDigits && cpf.includes(onlyDigits))
      );
    });
  }, [data, busca]);

  useEffect(() => setPagina(0), [busca]);

  const totalPaginas = Math.ceil(filtrados.length / PAGE_SIZE);
  const visiveis = filtrados.slice(pagina * PAGE_SIZE, (pagina + 1) * PAGE_SIZE);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Fornecedores ({filtrados.length})</CardTitle>
            <CardDescription>Saldos consignados de fornecedores</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Buscar por nome, CPF ou contrato..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-72"
            />
            <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Carregando...</div>
        ) : visiveis.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            {data && data.length === 0
              ? "Nenhum dado importado ainda. Faça upload de uma planilha acima."
              : "Nenhum resultado para a busca."}
          </div>
        ) : (
          <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>CPF/CNPJ</TableHead>
                    <TableHead>Loja</TableHead>
                    <TableHead>Contrato</TableHead>
                    <TableHead className="text-right">Saldo Bloqueado</TableHead>
                    <TableHead className="text-right">Saldo Liberado</TableHead>
                    <TableHead className="text-right">Saldo Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiveis.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.nome || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{formatCpfDisplay(r.cpf_cnpj)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.loja_nome || "—"}</TableCell>
                      <TableCell className="text-xs">{r.numero_contrato || "—"}</TableCell>
                      <TableCell className="text-right">{formatCurrency(r.saldo_bloqueado)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(r.saldo_liberado)}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(r.saldo_total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {totalPaginas > 1 && (
              <div className="flex items-center justify-between mt-4">
                <span className="text-sm text-muted-foreground">
                  Página {pagina + 1} de {totalPaginas}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPagina((p) => Math.max(0, p - 1))}
                    disabled={pagina === 0}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
                    disabled={pagina >= totalPaginas - 1}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function MoedaPrTable() {
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["saldos-moeda-pr-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("saldos_moeda_pr")
        .select("*")
        .order("nome", { ascending: true })
        .limit(10000);
      if (error) throw error;
      return data || [];
    },
  });

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const onlyDigits = termo.replace(/\D/g, "");
    if (!termo) return data || [];
    return (data || []).filter((r: any) => {
      const nome = (r.nome || "").toLowerCase();
      const cpf = (r.cpf_cnpj || "").toLowerCase();
      return nome.includes(termo) || (onlyDigits && cpf.includes(onlyDigits));
    });
  }, [data, busca]);

  useEffect(() => setPagina(0), [busca]);

  const totalPaginas = Math.ceil(filtrados.length / PAGE_SIZE);
  const visiveis = filtrados.slice(pagina * PAGE_SIZE, (pagina + 1) * PAGE_SIZE);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Clientes ({filtrados.length})</CardTitle>
            <CardDescription>Saldos em Moeda PR de clientes</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Buscar por nome ou CPF..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-72"
            />
            <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Carregando...</div>
        ) : visiveis.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            {data && data.length === 0
              ? "Nenhum dado importado ainda. Faça upload de uma planilha acima."
              : "Nenhum resultado para a busca."}
          </div>
        ) : (
          <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>CPF/CNPJ</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Loja</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiveis.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.nome || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{formatCpfDisplay(r.cpf_cnpj)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.email || "—"}</TableCell>
                      <TableCell className="text-xs">{r.telefone || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.loja || "—"}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(r.saldo)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {totalPaginas > 1 && (
              <div className="flex items-center justify-between mt-4">
                <span className="text-sm text-muted-foreground">
                  Página {pagina + 1} de {totalPaginas}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPagina((p) => Math.max(0, p - 1))}
                    disabled={pagina === 0}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
                    disabled={pagina >= totalPaginas - 1}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function SaldosExternos() {
  const { hasRole } = useAuth();
  const podeUpload = hasRole("admin_tenant") || hasRole("admin_master");
  const queryClient = useQueryClient();

  const refresh = (tipo: Tipo) => {
    queryClient.invalidateQueries({ queryKey: ["saldos-upload-log", tipo] });
    queryClient.invalidateQueries({
      queryKey: tipo === "consignado" ? ["saldos-consignado-list"] : ["saldos-moeda-pr-list"],
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Saldos Externos</h1>
        <p className="text-sm text-muted-foreground">
          Importe e visualize saldos de fornecedores (consignado) e clientes (moeda PR) vindos do sistema externo.
        </p>
      </div>

      <Tabs defaultValue="consignado" className="space-y-4">
        <TabsList>
          <TabsTrigger value="consignado">Consignado (Fornecedores)</TabsTrigger>
          <TabsTrigger value="moeda_pr">Moeda PR (Clientes)</TabsTrigger>
        </TabsList>

        <TabsContent value="consignado" className="space-y-4">
          <UploadCard tipo="consignado" podeUpload={podeUpload} onDone={() => refresh("consignado")} />
          <ConsignadoTable />
        </TabsContent>

        <TabsContent value="moeda_pr" className="space-y-4">
          <UploadCard tipo="moeda_pr" podeUpload={podeUpload} onDone={() => refresh("moeda_pr")} />
          <MoedaPrTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}
