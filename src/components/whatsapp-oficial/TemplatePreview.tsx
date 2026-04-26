import { Image as ImageIcon, Video as VideoIcon, ExternalLink, Reply } from "lucide-react";

interface ButtonItem {
  type: "QUICK_REPLY" | "URL";
  text: string;
  url?: string;
}

interface TemplatePreviewProps {
  headerType: "NONE" | "TEXT" | "IMAGE" | "VIDEO";
  headerText: string;
  headerExample: string;
  headerMediaUrl: string;
  body: string;
  bodyExamples: string[];
  footer: string;
  buttons: ButtonItem[];
}

/** Substitui {{N}} por examples[N-1]; se vazio, mantém {{N}} literal. */
function applyExamples(text: string, examples: string[]): string {
  if (!text) return "";
  return text.replace(/\{\{(\d+)\}\}/g, (_m, n) => {
    const idx = parseInt(n, 10) - 1;
    const v = examples[idx];
    return v && v.trim() ? v : `{{${n}}}`;
  });
}

export function TemplatePreview({
  headerType,
  headerText,
  headerExample,
  headerMediaUrl,
  body,
  bodyExamples,
  footer,
  buttons,
}: TemplatePreviewProps) {
  const headerRendered =
    headerType === "TEXT" ? applyExamples(headerText, [headerExample]) : "";
  const bodyRendered = applyExamples(body, bodyExamples);

  const hasContent =
    headerType !== "NONE" ||
    body.trim().length > 0 ||
    footer.trim().length > 0 ||
    buttons.length > 0;

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Pré-visualização
      </div>

      {/* Fundo estilo WhatsApp (papel de parede neutro) */}
      <div className="rounded-lg bg-[hsl(120_8%_92%)] dark:bg-muted/40 p-4">
        {/* Balão da mensagem */}
        <div className="max-w-[85%] ml-auto rounded-lg bg-[hsl(95_60%_88%)] dark:bg-emerald-950/40 shadow-sm overflow-hidden">
          {/* Header de mídia (sem padding, ocupa largura) */}
          {headerType === "IMAGE" && (
            <div className="bg-muted">
              {headerMediaUrl ? (
                <img
                  src={headerMediaUrl}
                  alt=""
                  className="w-full max-h-48 object-cover"
                />
              ) : (
                <div className="aspect-video flex items-center justify-center text-muted-foreground">
                  <ImageIcon className="h-10 w-10 opacity-40" />
                </div>
              )}
            </div>
          )}
          {headerType === "VIDEO" && (
            <div className="bg-muted">
              {headerMediaUrl ? (
                <video
                  src={headerMediaUrl}
                  controls
                  className="w-full max-h-48"
                />
              ) : (
                <div className="aspect-video flex items-center justify-center text-muted-foreground">
                  <VideoIcon className="h-10 w-10 opacity-40" />
                </div>
              )}
            </div>
          )}

          <div className="px-3 pt-2 pb-1.5 space-y-1.5">
            {headerType === "TEXT" && headerRendered && (
              <div className="font-bold text-sm text-foreground/90 whitespace-pre-wrap break-words">
                {headerRendered}
              </div>
            )}

            {bodyRendered ? (
              <div className="text-sm text-foreground/90 whitespace-pre-wrap break-words">
                {bodyRendered}
              </div>
            ) : !hasContent ? (
              <div className="text-sm italic text-muted-foreground">
                A mensagem aparecerá aqui conforme você preenche o formulário.
              </div>
            ) : null}

            {footer && (
              <div className="text-[11px] text-muted-foreground whitespace-pre-wrap break-words pt-0.5">
                {footer}
              </div>
            )}

            <div className="flex justify-end items-center gap-1 pt-0.5">
              <span className="text-[10px] text-muted-foreground">12:34</span>
              <span className="text-[10px] text-sky-600">✓✓</span>
            </div>
          </div>

          {buttons.length > 0 && (
            <div className="border-t border-border/40">
              {buttons.map((b, i) => (
                <div
                  key={i}
                  className={`px-3 py-2 text-center text-sm font-medium flex items-center justify-center gap-1.5 ${
                    b.type === "URL"
                      ? "text-sky-700 dark:text-sky-400"
                      : "text-sky-700 dark:text-sky-400"
                  } ${i > 0 ? "border-t border-border/40" : ""}`}
                >
                  {b.type === "URL" ? (
                    <ExternalLink className="h-3.5 w-3.5" />
                  ) : (
                    <Reply className="h-3.5 w-3.5" />
                  )}
                  {b.text || (
                    <span className="italic opacity-60">Botão sem texto</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Esta é apenas uma simulação visual; a aparência real depende do app do
        cliente.
      </p>
    </div>
  );
}
