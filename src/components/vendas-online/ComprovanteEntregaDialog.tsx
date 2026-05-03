import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Printer, Download, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

type Item = {
  id: string;
  numero: number;
  descricao: string;
  valor: number;
  forma_pagamento: string | null;
  pagador_nome: string | null;
  pagador_email: string | null;
  pagador_cel: string | null;
  pagador_tax_id: string | null;
  pago_em: string | null;
  entregue_em: string | null;
  entregue_para_proprio: boolean | null;
  entregue_para_nome: string | null;
  entregue_para_doc: string | null;
  entregue_assinatura: string | null;
};

type LogRow = {
  id: string;
  acao: string;
  usuario_nome: string | null;
  retirante_proprio: boolean | null;
  retirante_nome: string | null;
  retirante_doc: string | null;
  created_at: string;
};

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR");
}

export function ComprovanteEntregaDialog({
  open, onOpenChange, item,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: Item | null;
}) {
  const printRef = useRef<HTMLDivElement>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!open || !item) return;
    setLoadingLogs(true);
    (supabase as any)
      .from("chamado_denis_entregas_log")
      .select("id, acao, usuario_nome, retirante_proprio, retirante_nome, retirante_doc, created_at")
      .eq("item_id", item.id)
      .order("created_at", { ascending: false })
      .then(({ data }: { data: LogRow[] | null }) => {
        setLogs((data || []) as LogRow[]);
        setLoadingLogs(false);
      });
  }, [open, item]);

  const handlePrint = () => {
    document.body.classList.add("printing-comprovante");
    window.print();
    setTimeout(() => document.body.classList.remove("printing-comprovante"), 500);
  };

  const handlePdf = async () => {
    if (!printRef.current || !item) return;
    setGenerating(true);
    try {
      const canvas = await html2canvas(printRef.current, { scale: 2, backgroundColor: "#ffffff" });
      const img = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const ratio = canvas.height / canvas.width;
      const w = pageW - 20;
      const h = w * ratio;
      pdf.addImage(img, "PNG", 10, 10, w, h);
      pdf.save(`comprovante-entrega-${item.numero}.pdf`);
    } finally {
      setGenerating(false);
    }
  };

  if (!item) return null;

  const retiranteTxt = item.entregue_para_proprio
    ? `Próprio comprador${item.pagador_nome ? ` (${item.pagador_nome})` : ""}`
    : item.entregue_para_nome || "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Comprovante de entrega — #{item.numero}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="comprovante">
          <TabsList>
            <TabsTrigger value="comprovante">Comprovante</TabsTrigger>
            <TabsTrigger value="historico">Histórico ({logs.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="comprovante" className="space-y-3">
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-1" /> Imprimir
              </Button>
              <Button size="sm" onClick={handlePdf} disabled={generating}>
                {generating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
                Baixar PDF
              </Button>
            </div>

            <div id="comprovante-print" ref={printRef} className="bg-white text-black p-6 rounded-md border text-sm space-y-4">
              <div className="text-center border-b pb-3">
                <h2 className="text-lg font-bold">Comprovante de Entrega</h2>
                <p className="text-xs text-gray-600">Vendas Online</p>
              </div>

              <section>
                <h3 className="font-semibold text-xs uppercase text-gray-600 mb-1">Produto</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-gray-600">ID:</span> #{item.numero}</div>
                  <div><span className="text-gray-600">Valor:</span> {brl(Number(item.valor || 0))}</div>
                  <div className="col-span-2"><span className="text-gray-600">Descrição:</span> {item.descricao}</div>
                  <div><span className="text-gray-600">Forma pgto.:</span> {item.forma_pagamento || "—"}</div>
                  <div><span className="text-gray-600">Pago em:</span> {fmt(item.pago_em)}</div>
                </div>
              </section>

              <section>
                <h3 className="font-semibold text-xs uppercase text-gray-600 mb-1">Comprador</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-gray-600">Nome:</span> {item.pagador_nome || "—"}</div>
                  <div><span className="text-gray-600">CPF:</span> {item.pagador_tax_id || "—"}</div>
                  <div><span className="text-gray-600">Email:</span> {item.pagador_email || "—"}</div>
                  <div><span className="text-gray-600">Tel:</span> {item.pagador_cel || "—"}</div>
                </div>
              </section>

              <section>
                <h3 className="font-semibold text-xs uppercase text-gray-600 mb-1">Retirada</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-gray-600">Data:</span> {fmt(item.entregue_em)}</div>
                  <div><span className="text-gray-600">Quem retirou:</span> {retiranteTxt}</div>
                  {!item.entregue_para_proprio && item.entregue_para_doc && (
                    <div className="col-span-2"><span className="text-gray-600">Documento:</span> {item.entregue_para_doc}</div>
                  )}
                </div>
              </section>

              {item.entregue_assinatura && (
                <section>
                  <h3 className="font-semibold text-xs uppercase text-gray-600 mb-1">Assinatura</h3>
                  <div className="border rounded-md p-2 bg-gray-50">
                    <img src={item.entregue_assinatura} alt="Assinatura" className="max-h-32 mx-auto" />
                  </div>
                </section>
              )}

              <div className="text-[10px] text-gray-500 text-right pt-2 border-t">
                Emitido em {new Date().toLocaleString("pt-BR")}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="historico">
            {loadingLogs ? (
              <div className="text-center py-6 text-muted-foreground text-sm">Carregando...</div>
            ) : logs.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">Nenhum registro de auditoria.</div>
            ) : (
              <div className="space-y-2">
                {logs.map((l) => (
                  <div key={l.id} className="rounded-md border p-3 text-sm space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant={l.acao === "entregue" ? "default" : "secondary"}>
                        {l.acao === "entregue" ? "Entrega confirmada" : "Entrega desfeita"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{fmt(l.created_at)}</span>
                    </div>
                    <div className="text-xs">
                      <span className="text-muted-foreground">Usuário:</span> {l.usuario_nome || "—"}
                    </div>
                    {l.acao === "entregue" && (
                      <div className="text-xs">
                        <span className="text-muted-foreground">Retirante:</span>{" "}
                        {l.retirante_proprio ? "Próprio comprador" : (l.retirante_nome || "—")}
                        {l.retirante_doc ? ` · ${l.retirante_doc}` : ""}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
