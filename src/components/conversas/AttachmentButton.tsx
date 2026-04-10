import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Paperclip } from "lucide-react";

interface AttachmentButtonProps {
  onSelect: (file: File) => void;
  disabled?: boolean;
}

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function AttachmentButton({ onSelect, disabled }: AttachmentButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onSelect(file);
      e.target.value = "";
    }
  };

  return (
    <>
      <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={handleChange} />
      <Button size="icon" variant="ghost" onClick={() => inputRef.current?.click()} disabled={disabled} className="h-9 w-9">
        <Paperclip className="h-4 w-4" />
      </Button>
    </>
  );
}
