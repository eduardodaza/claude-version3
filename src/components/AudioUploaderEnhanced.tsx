import { useState, useRef } from 'react';
import { Upload, X, Music } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface AudioUploaderEnhancedProps {
  onFileSelect: (file: File) => void;
  onFilesSelect?: (files: File[]) => void;
  selectedFile: File | null;
  selectedFiles?: File[];
  onClear: () => void;
  onRemoveFile?: (index: number) => void;
  isProcessing: boolean;
  disabled?: boolean;
  multiple?: boolean;
}

const ACCEPTED_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/m4a',
  'audio/ogg',
  'audio/webm',
  'audio/x-m4a',
];

const MAX_SIZE = 100 * 1024 * 1024; // 100MB

export function AudioUploaderEnhanced({
  onFileSelect,
  onFilesSelect,
  selectedFile,
  selectedFiles = [],
  onClear,
  onRemoveFile,
  isProcessing,
  disabled = false,
  multiple = false,
}: AudioUploaderEnhancedProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return `"${file.name}": Formato no válido. Use MP3, WAV, M4A, OGG o WebM.`;
    }
    if (file.size > MAX_SIZE) {
      return `"${file.name}": Archivo muy grande. Máximo 100MB. (${(file.size / (1024 * 1024)).toFixed(2)}MB)`;
    }
    return null;
  };

  const handleFiles = (fileList: FileList) => {
    if (multiple && onFilesSelect) {
      const validFiles: File[] = [];
      const errors: string[] = [];
      
      Array.from(fileList).forEach(file => {
        const validationError = validateFile(file);
        if (validationError) {
          errors.push(validationError);
        } else {
          validFiles.push(file);
        }
      });

      if (errors.length > 0) {
        setError(errors.join('\n'));
      } else {
        setError(null);
      }

      if (validFiles.length > 0) {
        onFilesSelect(validFiles);
      }
    } else {
      const file = fileList[0];
      if (file) {
        const validationError = validateFile(file);
        if (validationError) {
          setError(validationError);
          return;
        }
        setError(null);
        onFileSelect(file);
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || isProcessing) return;
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled && !isProcessing) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleClick = () => {
    if (!disabled && !isProcessing) {
      fileInputRef.current?.click();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
    // Reset input so same files can be re-selected
    e.target.value = '';
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Multiple files selected
  const filesToShow = multiple ? selectedFiles : (selectedFile ? [selectedFile] : []);

  if (filesToShow.length > 0) {
    return (
      <div className="w-full space-y-3">
        {filesToShow.map((file, index) => (
          <div key={`${file.name}-${index}`} className="border border-border rounded-xl bg-card p-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Music className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate text-sm">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatSize(file.size)}
                </p>
              </div>
              {!isProcessing && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (multiple && onRemoveFile) {
                      onRemoveFile(index);
                    } else {
                      onClear();
                    }
                  }}
                  className="flex-shrink-0 h-8 w-8"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
            {/* Audio preview only for single file */}
            {filesToShow.length === 1 && (
              <div className="mt-3">
                <audio
                  controls
                  src={URL.createObjectURL(file)}
                  className="w-full"
                />
              </div>
            )}
          </div>
        ))}

        {/* Allow adding more files when in multiple mode */}
        {multiple && !isProcessing && (
          <div
            onClick={handleClick}
            className="border border-dashed border-border rounded-xl p-3 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-all"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(',')}
              onChange={handleInputChange}
              className="hidden"
              multiple={multiple}
              disabled={disabled || isProcessing}
            />
            <p className="text-sm text-muted-foreground">
              + Agregar más archivos de audio
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive whitespace-pre-line">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="w-full">
      <div
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all',
          isDragging && 'border-primary bg-primary/5',
          !isDragging && 'border-border hover:border-primary/50 hover:bg-muted/30',
          (disabled || isProcessing) && 'opacity-50 cursor-not-allowed'
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          onChange={handleInputChange}
          className="hidden"
          multiple={multiple}
          disabled={disabled || isProcessing}
        />

        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
            <Upload className="w-6 h-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium text-foreground">
              {multiple ? 'Arrastra uno o varios archivos de audio aquí' : 'Arrastra un archivo de audio aquí'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              o haz clic para seleccionar
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            MP3, WAV, M4A, OGG, WebM • Máximo 100MB por archivo
          </p>
        </div>
      </div>

      {error && (
        <p className="mt-2 text-sm text-destructive whitespace-pre-line">{error}</p>
      )}
    </div>
  );
}
