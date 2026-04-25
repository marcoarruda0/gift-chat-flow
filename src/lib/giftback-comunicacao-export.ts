// Exportação de logs de comunicação Giftback em CSV/PDF.
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface LogExport {
  enviado_em: string;
  status: string;
  erro: string | null;
  wa_message_id: string | null;
  is_teste: boolean | null;
  regra_nome: string;
  regra_gatilho: string;
  contato_nome: string;
  contato_telefone: string;
}

const GATILHO_LABELS: Record<string, string> = {
  criado: "Giftback criado",
  vencendo: "Saldo vencendo",
  expirado: "Giftback expirado",
};

function fmtData(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (s.includes(";") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportarLogsCSV(logs: LogExport[], filename = "comunicacoes-giftback.csv"): void {
  const headers = [
    "Data/Hora",
    "Regra",
    "Gatilho",
    "Contato",
    "Telefone",
    "Status",
    "Teste",
    "Erro",
    "WA Message ID",
  ];
  const rows = logs.map((l) => [
    fmtData(l.enviado_em),
    l.regra_nome,
    GATILHO_LABELS[l.regra_gatilho] || l.regra_gatilho || "",
    l.contato_nome,
    l.contato_telefone,
    l.status,
    l.is_teste ? "Sim" : "Não",
    l.erro || "",
    l.wa_message_id || "",
  ]);

  const sep = ";";
  const lines = [headers, ...rows].map((row) => row.map(csvEscape).join(sep));
  // BOM para Excel pt-BR reconhecer UTF-8
  const csv = "\uFEFF" + lines.join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface PdfFiltros {
  regra?: string;
  gatilho?: string;
  status?: string;
  periodoInicio?: string;
  periodoFim?: string;
}

export function exportarLogsPDF(
  logs: LogExport[],
  filtros: PdfFiltros,
  tenantNome: string,
  filename = "comunicacoes-giftback.pdf",
): void {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(14);
  doc.text("Relatório de Envios de Giftback", 14, 15);

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(tenantNome || "—", 14, 22);
  doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, pageWidth - 14, 22, { align: "right" });

  // Linha de filtros
  const filtrosTxt: string[] = [];
  if (filtros.regra) filtrosTxt.push(`Regra: ${filtros.regra}`);
  if (filtros.gatilho) filtrosTxt.push(`Gatilho: ${GATILHO_LABELS[filtros.gatilho] || filtros.gatilho}`);
  if (filtros.status) filtrosTxt.push(`Status: ${filtros.status}`);
  if (filtros.periodoInicio || filtros.periodoFim) {
    filtrosTxt.push(`Período: ${filtros.periodoInicio || "—"} a ${filtros.periodoFim || "—"}`);
  }
  if (filtrosTxt.length === 0) filtrosTxt.push("Sem filtros aplicados");
  doc.setFontSize(9);
  doc.text(filtrosTxt.join("  ·  "), 14, 28);

  doc.setTextColor(0);

  autoTable(doc, {
    startY: 33,
    head: [["Data/Hora", "Regra", "Gatilho", "Contato", "Telefone", "Status", "Teste", "Erro"]],
    body: logs.map((l) => [
      fmtData(l.enviado_em),
      l.regra_nome,
      GATILHO_LABELS[l.regra_gatilho] || l.regra_gatilho || "",
      l.contato_nome,
      l.contato_telefone,
      l.status,
      l.is_teste ? "Sim" : "Não",
      (l.erro || "").slice(0, 60),
    ]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: {
      0: { cellWidth: 32 },
      5: { cellWidth: 20 },
      6: { cellWidth: 14 },
      7: { cellWidth: 60 },
    },
    margin: { left: 10, right: 10 },
  });

  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(
      `Página ${i} de ${totalPages}  ·  Total de envios: ${logs.length}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 6,
      { align: "center" },
    );
  }

  doc.save(filename);
}
