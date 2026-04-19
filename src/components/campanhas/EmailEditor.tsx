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
} from "lucide-react";
import { useEffect } from "react";

interface EmailEditorProps {
  value: string;
  onChange: (html: string) => void;
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

export function EmailEditor({ value, onChange }: EmailEditorProps) {
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
          "prose prose-sm max-w-none min-h-[200px] max-h-[400px] overflow-y-auto p-3 focus:outline-none border border-t-0 border-input rounded-b-md bg-background",
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

  return (
    <div>
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
      <p className="text-xs text-muted-foreground mt-1">
        Variáveis: <code className="bg-muted px-1 rounded">{"{nome}"}</code>{" "}
        <code className="bg-muted px-1 rounded">{"{email}"}</code>
      </p>
    </div>
  );
}
