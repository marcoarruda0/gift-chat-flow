import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Bold,
  Italic,
  UnderlineIcon,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  Image as ImageIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo,
  Redo,
  Palette,
  Eye,
  Pencil,
} from "lucide-react";
import { useEffect, useMemo } from "react";

interface EmailEditorProps {
  value: string;
  onChange: (html: string) => void;
  subject?: string;
  previewText?: string;
  signatureHtml?: string | null;
  fromName?: string | null;
}

function Toolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;

  const addLink = () => {
    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("URL", previousUrl);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const addImage = () => {
    const url = window.prompt("URL da imagem");
    if (url) editor.chain().focus().setImage({ src: url }).run();
  };

  const setColor = () => {
    const color = window.prompt("Cor (ex: #ff0000)", "#000000");
    if (color) editor.chain().focus().setColor(color).run();
  };

  return (
    <div className="border border-input rounded-t-md p-1 flex flex-wrap gap-0.5 bg-muted/30">
      <Toggle size="sm" pressed={editor.isActive("bold")} onPressedChange={() => editor.chain().focus().toggleBold().run()} aria-label="Negrito">
        <Bold className="h-4 w-4" />
      </Toggle>
      <Toggle size="sm" pressed={editor.isActive("italic")} onPressedChange={() => editor.chain().focus().toggleItalic().run()} aria-label="Itálico">
        <Italic className="h-4 w-4" />
      </Toggle>
      <Toggle size="sm" pressed={editor.isActive("underline")} onPressedChange={() => editor.chain().focus().toggleUnderline().run()} aria-label="Sublinhado">
        <UnderlineIcon className="h-4 w-4" />
      </Toggle>

      <Separator orientation="vertical" className="h-6 mx-1" />

      <Toggle size="sm" pressed={editor.isActive("heading", { level: 1 })} onPressedChange={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} aria-label="Título 1">
        <Heading1 className="h-4 w-4" />
      </Toggle>
      <Toggle size="sm" pressed={editor.isActive("heading", { level: 2 })} onPressedChange={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} aria-label="Título 2">
        <Heading2 className="h-4 w-4" />
      </Toggle>

      <Separator orientation="vertical" className="h-6 mx-1" />

      <Toggle size="sm" pressed={editor.isActive("bulletList")} onPressedChange={() => editor.chain().focus().toggleBulletList().run()} aria-label="Lista">
        <List className="h-4 w-4" />
      </Toggle>
      <Toggle size="sm" pressed={editor.isActive("orderedList")} onPressedChange={() => editor.chain().focus().toggleOrderedList().run()} aria-label="Lista numerada">
        <ListOrdered className="h-4 w-4" />
      </Toggle>
      <Toggle size="sm" pressed={editor.isActive("blockquote")} onPressedChange={() => editor.chain().focus().toggleBlockquote().run()} aria-label="Citação">
        <Quote className="h-4 w-4" />
      </Toggle>

      <Separator orientation="vertical" className="h-6 mx-1" />

      <Toggle size="sm" pressed={editor.isActive({ textAlign: "left" })} onPressedChange={() => editor.chain().focus().setTextAlign("left").run()} aria-label="Alinhar à esquerda">
        <AlignLeft className="h-4 w-4" />
      </Toggle>
      <Toggle size="sm" pressed={editor.isActive({ textAlign: "center" })} onPressedChange={() => editor.chain().focus().setTextAlign("center").run()} aria-label="Centralizar">
        <AlignCenter className="h-4 w-4" />
      </Toggle>
      <Toggle size="sm" pressed={editor.isActive({ textAlign: "right" })} onPressedChange={() => editor.chain().focus().setTextAlign("right").run()} aria-label="Alinhar à direita">
        <AlignRight className="h-4 w-4" />
      </Toggle>

      <Separator orientation="vertical" className="h-6 mx-1" />

      <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={addLink}>
        <LinkIcon className="h-4 w-4" />
      </Button>
      <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={addImage}>
        <ImageIcon className="h-4 w-4" />
      </Button>
      <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={setColor}>
        <Palette className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="h-6 mx-1" />

      <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => editor.chain().focus().undo().run()}>
        <Undo className="h-4 w-4" />
      </Button>
      <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => editor.chain().focus().redo().run()}>
        <Redo className="h-4 w-4" />
      </Button>
    </div>
  );
}

function buildPreviewDoc(html: string, signatureHtml?: string | null) {
  const safeBody = html || '<p style="color:#9ca3af">Comece a escrever sua mensagem...</p>';
  const signature = signatureHtml
    ? `<hr style="margin:32px 0 16px;border:none;border-top:1px solid #e5e7eb"/><div style="font-size:12px;color:#6b7280;line-height:1.5">${signatureHtml}</div>`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
    body{margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827}
    .wrap{max-width:600px;margin:24px auto;background:#ffffff;padding:32px;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
    p{margin:0 0 12px;line-height:1.6;font-size:15px}
    h1{font-size:24px;margin:0 0 16px}
    h2{font-size:20px;margin:0 0 14px}
    a{color:#1d4ed8;text-decoration:underline}
    img{max-width:100%;height:auto}
    blockquote{border-left:4px solid #e5e7eb;margin:0 0 12px;padding:4px 12px;color:#6b7280}
    ul,ol{padding-left:24px;margin:0 0 12px}
  </style></head><body><div class="wrap">${safeBody}${signature}</div></body></html>`;
}

function PreviewPane({
  html,
  subject,
  previewText,
  signatureHtml,
  fromName,
}: {
  html: string;
  subject?: string;
  previewText?: string;
  signatureHtml?: string | null;
  fromName?: string | null;
}) {
  const srcDoc = useMemo(() => buildPreviewDoc(html, signatureHtml), [html, signatureHtml]);
  return (
    <div className="border border-input rounded-md overflow-hidden bg-muted/20 flex flex-col h-full min-h-[400px]">
      {/* Inbox simulation header */}
      <div className="px-4 py-3 bg-background border-b">
        <div className="flex items-baseline gap-2 text-xs text-muted-foreground mb-1">
          <span className="font-medium text-foreground">De:</span>
          <span className="truncate">{fromName || "Sua Empresa"}</span>
        </div>
        <p className="font-semibold text-sm truncate">
          {subject || <span className="text-muted-foreground italic">Sem assunto</span>}
        </p>
        {previewText && (
          <p className="text-xs text-muted-foreground truncate">{previewText}</p>
        )}
      </div>
      <iframe
        title="Preview do e-mail"
        srcDoc={srcDoc}
        className="flex-1 w-full bg-muted/30 border-0"
        sandbox=""
      />
    </div>
  );
}

export function EmailEditor({
  value,
  onChange,
  subject,
  previewText,
  signatureHtml,
  fromName,
}: EmailEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false, HTMLAttributes: { class: "text-primary underline" } }),
      Image,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      Color,
    ],
    content: value || "",
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none min-h-[360px] max-h-[500px] overflow-y-auto p-3 focus:outline-none border border-t-0 border-input rounded-b-md bg-background",
      },
    },
  });

  // Sync external value changes (e.g., reset)
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const editorPane = (
    <div>
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
      <p className="text-xs text-muted-foreground mt-1">
        Variáveis: <code className="bg-muted px-1 rounded">{"{nome}"}</code>{" "}
        <code className="bg-muted px-1 rounded">{"{email}"}</code>
      </p>
    </div>
  );

  const previewPane = (
    <PreviewPane
      html={value}
      subject={subject}
      previewText={previewText}
      signatureHtml={signatureHtml}
      fromName={fromName}
    />
  );

  return (
    <>
      {/* Desktop: side-by-side */}
      <div className="hidden lg:grid lg:grid-cols-2 gap-4">
        {editorPane}
        {previewPane}
      </div>
      {/* Mobile/tablet: tabs */}
      <div className="lg:hidden">
        <Tabs defaultValue="editor">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="editor" className="gap-2">
              <Pencil className="h-4 w-4" /> Editor
            </TabsTrigger>
            <TabsTrigger value="preview" className="gap-2">
              <Eye className="h-4 w-4" /> Preview
            </TabsTrigger>
          </TabsList>
          <TabsContent value="editor" className="mt-3">{editorPane}</TabsContent>
          <TabsContent value="preview" className="mt-3 h-[500px]">{previewPane}</TabsContent>
        </Tabs>
      </div>
    </>
  );
}
