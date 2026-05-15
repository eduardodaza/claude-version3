import { Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { useEffect, useState } from 'react';

interface TranscriptionProgressProps {
  fileName: string;
  fileSize: number;
}

export function TranscriptionProgress({ fileName, fileSize }: TranscriptionProgressProps) {
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('Uploading audio...');

  // Estimate processing time based on file size (rough estimate)
  const estimatedSeconds = Math.max(10, Math.ceil(fileSize / (1024 * 1024) * 3));

  useEffect(() => {
    const startTime = Date.now();
    const totalDuration = estimatedSeconds * 1000;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const newProgress = Math.min(95, (elapsed / totalDuration) * 100);
      setProgress(newProgress);

      // Update status text based on progress
      if (newProgress < 20) {
        setStatusText('Uploading audio...');
      } else if (newProgress < 40) {
        setStatusText('Processing audio file...');
      } else if (newProgress < 70) {
        setStatusText('Transcribing with OpenAI Whisper...');
      } else {
        setStatusText('Finalizing transcription...');
      }
    }, 200);

    return () => clearInterval(interval);
  }, [estimatedSeconds]);

  return (
    <div className="w-full p-6 border border-border rounded-xl bg-card">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-primary animate-spin" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground truncate">{fileName}</p>
          <p className="text-sm text-muted-foreground">{statusText}</p>
        </div>
      </div>
      
      <Progress value={progress} className="h-2" />
      
      <p className="text-xs text-muted-foreground mt-3 text-center">
        This may take a moment for longer audio files. Please don't close this page.
      </p>
    </div>
  );
}
