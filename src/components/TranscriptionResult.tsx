import { useState } from 'react';
import { Copy, Download, Check, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';

interface TranscriptionResultProps {
  text: string;
}

export function TranscriptionResult({ text }: TranscriptionResultProps) {
  const [copied, setCopied] = useState(false);

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  const charCount = text.length;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  const handleDownload = () => {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcription-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Downloaded transcription');
  };

  return (
    <div className="w-full border border-border rounded-xl bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">Transcription</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="gap-2"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            className="gap-2"
          >
            <Download className="w-4 h-4" />
            Download
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="h-[400px]">
        <div className="p-6">
          <p className="text-foreground whitespace-pre-wrap leading-relaxed">
            {text}
          </p>
        </div>
      </ScrollArea>

      {/* Footer with stats */}
      <div className="flex items-center gap-4 p-4 border-t border-border bg-muted/30 text-sm text-muted-foreground">
        <span>{wordCount.toLocaleString()} words</span>
        <span>•</span>
        <span>{charCount.toLocaleString()} characters</span>
      </div>
    </div>
  );
}
