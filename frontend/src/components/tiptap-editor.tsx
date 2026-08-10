"use client";

import React from "react";
import {
  Bold, Italic, Heading1, Heading2, Heading3,
  LinkIcon, Code2, Calculator, ImageIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import toast from "react-hot-toast";

interface TipTapEditorProps {
  initialContent?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
}

export function TipTapEditor({
  initialContent = "",
  onChange,
  placeholder = "Агуулгыг HTML / Markdown хэлбэрээр энд оруулах буюу засна уу...",
}: TipTapEditorProps) {
  const [content, setContent] = React.useState(initialContent);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Sync initialContent once when loaded
  React.useEffect(() => {
    if (initialContent && content !== initialContent && (content === "" || content === "<p></p>" || content === "<p>Энд онолын хичээл эсвэл бодлогын өгүүлбэрээ бичнэ үү...</p>" || content === "<p>Сэдвийн онолын хэсэг, жишээ тайлбар, зургуудыг энд оруулна уу...</p>" || content === "<p>Бодлогын өгүүлбэр, оролт гаралтын хэлбэр, болон хязгаарлалтуудыг энд бичнэ үү...</p>")) {
      setContent(initialContent);
    }
  }, [initialContent]);

  const handleTextareaChange = (val: string) => {
    setContent(val);
    if (onChange) {
      onChange(val);
    }
  };

  const insertTag = (before: string, after: string = "") => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.substring(start, end);
    const replacement = before + selected + after;

    const newValue = text.substring(0, start) + replacement + text.substring(end);
    
    handleTextareaChange(newValue);

    // Focus back and set selection inside the inserted tags
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + before.length + selected.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    const uploadToast = toast.loading("Зураг байршуулж байна...");
    try {
      const response = await api.post("/upload/image", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      if (response.data?.url) {
        toast.success("Зураг амжилттай байршлаа!", { id: uploadToast });
        const imgTag = `<img src="${response.data.url}" alt="${file.name.split(".")[0]}" class="rounded-2xl border border-border shadow-md my-4 max-w-full mx-auto" />`;
        insertTag(imgTag, "");
      } else {
        toast.error("Зургийн хаяг олдсонгүй.", { id: uploadToast });
      }
    } catch (error) {
      console.error("Error uploading image:", error);
      toast.error("Зураг хуулахад алдаа гарлаа.", { id: uploadToast });
    }
  };

  const triggerImageUpload = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full rounded-2xl border border-border bg-card overflow-hidden flex flex-col min-h-[400px]">
      {/* ── Textarea Formatting Toolbar ── */}
      <div className="flex flex-wrap items-center gap-1.5 p-2 bg-secondary/35 border-b border-border select-none">
        
        {/* Headings */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => insertTag("<h1>", "</h1>")}
          className="h-8 px-2 rounded-lg text-xs font-black text-foreground hover:bg-white/5"
          title="Гарчиг 1"
        >
          <Heading1 className="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => insertTag("<h2>", "</h2>")}
          className="h-8 px-2 rounded-lg text-xs font-black text-foreground hover:bg-white/5"
          title="Гарчиг 2"
        >
          <Heading2 className="w-4 h-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => insertTag("<h3>", "</h3>")}
          className="h-8 px-2 rounded-lg text-xs font-black text-foreground hover:bg-white/5"
          title="Гарчиг 3"
        >
          <Heading3 className="w-4 h-4" />
        </Button>

        <div className="h-4 w-px bg-border mx-1" />

        {/* Text Formats */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => insertTag("<strong>", "</strong>")}
          className="h-8 w-8 p-0 rounded-lg hover:bg-white/5"
          title="Тод"
        >
          <Bold className="w-4 h-4 text-foreground" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => insertTag("<em>", "</em>")}
          className="h-8 w-8 p-0 rounded-lg hover:bg-white/5"
          title="Налуу"
        >
          <Italic className="w-4 h-4 text-foreground" />
        </Button>

        <div className="h-4 w-px bg-border mx-1" />

        {/* Code & Math */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => insertTag("<pre><code>", "</code></pre>")}
          className="h-8 w-8 p-0 rounded-lg hover:bg-white/5"
          title="Код блок"
        >
          <Code2 className="w-4 h-4 text-foreground" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => insertTag("$", "$")}
          className="h-8 px-2.5 rounded-lg flex items-center gap-1 text-xs text-brand-cyan hover:bg-brand-cyan/10"
          title="Математик томьёо"
        >
          <Calculator className="w-4 h-4" />
          <span>Математик</span>
        </Button>

        <div className="h-4 w-px bg-border mx-1" />

        {/* Media & Link */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => insertTag('<a href="url" class="text-primary underline font-medium">', "</a>")}
          className="h-8 w-8 p-0 rounded-lg hover:bg-white/5"
          title="Холбоос"
        >
          <LinkIcon className="w-4 h-4 text-foreground" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={triggerImageUpload}
          className="h-8 w-8 p-0 rounded-lg hover:bg-white/5"
          title="Зураг байршуулах"
        >
          <ImageIcon className="w-4 h-4 text-brand-emerald" />
        </Button>
      </div>

      {/* ── Textarea Editable Area ── */}
      <div className="flex-1 bg-card relative">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => handleTextareaChange(e.target.value)}
          placeholder={placeholder}
          className="w-full min-h-[350px] p-6 focus:outline-none text-foreground font-mono text-xs leading-relaxed bg-transparent outline-none resize-y border-none"
        />
      </div>

      {/* ── Footer Stats ── */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-secondary/15 border-t border-border/40 text-[10px] text-muted-foreground select-none">
        <span>Энгийн текст горим (HTML / Markdown дэмжинэ)</span>
        <span>Тэмдэгт: {content.length}</span>
      </div>

      {/* Hidden file input for image upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImageUpload}
        accept="image/*"
        style={{ display: "none" }}
      />
    </div>
  );
}
