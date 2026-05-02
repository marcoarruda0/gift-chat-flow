import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Eraser } from "lucide-react";

export type EntregaPayload = {
  proprio: boolean;
  nome: string | null;
  doc: string | null;
  assinatura: string; // data URL PNG
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  itemNumero: number;
  itemDescricao: string;
  pagadorNome: string | null;
  pagadorTaxId: string | null;
  onConfirm: (payload: EntregaPayload) => Promise<void> | void;
};

export function ConfirmarEntregaDialog({
  open, onOpenChange, itemNumero, itemDescricao, pagadorNome, pagadorTaxId, onConfirm,
}: Props) {
  const [proprio, setProprio] = useState(true);
  const [nome, setNome] = useState("");
  const [doc, setDoc] = useState("");
  const [hasSignature, setHasSignature] = useState(false);
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);

  // reset on open
  useEffect(() => {
    if (open) {
      setProprio(true);
      setNome("");
      setDoc("");
      setHasSignature(false);
      // clear canvas after mount
      requestAnimationFrame(() => clearCanvas());
    }
  }, [open]);

  const setupCanvas = (canvas: HTMLCanvasElement) => {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#111827";
    }
  };

  useEffect(() => {
    const c = canvasRef.current;
    if (c && open) setupCanvas(c);
  }, [open]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastRef.current = pos(e);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx || !lastRef.current) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastRef.current = p;
    if (!hasSignature) setHasSignature(true);
  };
  const onUp = () => {
    drawingRef.current = false;
    lastRef.current = null;
  };

  const clearCanvas = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.restore();
    setHasSignature(false);
  };

  const canConfirm = hasSignature && (proprio || nome.trim().length > 0) && !saving;

  const handleConfirm = async () => {
    const c = canvasRef.current;
    if (!c) return;
    setSaving(true);
    try {
      await onConfirm({
        proprio,
        nome: proprio ? null : nome.trim(),
        doc: proprio ? null : (doc.trim() || null),
        assinatura: c.toDataURL("image/png"),
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Confirmar entrega — #{itemNumero}</DialogTitle>
          <DialogDescription className="truncate">{itemDescricao}</DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <div className="font-medium">Comprador</div>
          <div>{pagadorNome || <span className="text-muted-foreground italic">Sem nome</span>}</div>
          {pagadorTaxId && <div className="text-xs text-muted-foreground">CPF: {pagadorTaxId}</div>}
        </div>

        <div className="space-y-2">
          <Label>Quem está retirando?</Label>
          <RadioGroup value={proprio ? "proprio" : "outro"} onValueChange={(v) => setProprio(v === "proprio")}>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="proprio" id="ret-proprio" />
              <Label htmlFor="ret-proprio" className="font-normal cursor-pointer">
                Próprio comprador {pagadorNome ? `(${pagadorNome})` : ""}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="outro" id="ret-outro" />
              <Label htmlFor="ret-outro" className="font-normal cursor-pointer">Outra pessoa</Label>
            </div>
          </RadioGroup>
        </div>

        {!proprio && (
          <div className="space-y-2">
            <div>
              <Label htmlFor="ret-nome">Nome de quem está retirando *</Label>
              <Input id="ret-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} />
            </div>
            <div>
              <Label htmlFor="ret-doc">Documento (CPF/RG)</Label>
              <Input id="ret-doc" value={doc} onChange={(e) => setDoc(e.target.value)} maxLength={30} />
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Assinatura *</Label>
            <Button type="button" variant="ghost" size="sm" onClick={clearCanvas}>
              <Eraser className="h-3.5 w-3.5 mr-1" /> Limpar
            </Button>
          </div>
          <div className="rounded-md border bg-background">
            <canvas
              ref={canvasRef}
              className="w-full h-[140px] touch-none rounded-md cursor-crosshair"
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onPointerLeave={onUp}
            />
          </div>
          <p className="text-xs text-muted-foreground">Assine no quadro acima usando o dedo ou mouse.</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            {saving ? "Salvando..." : "Confirmar entrega"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
