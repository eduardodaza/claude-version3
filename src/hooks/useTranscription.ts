import { useState, useCallback } from 'react';

interface TranscriptionState {
  isProcessing: boolean;
  error: string | null;
  transcription: string | null;
}

export function useTranscription() {
  const [state, setState] = useState<TranscriptionState>({
    isProcessing: false,
    error: null,
    transcription: null,
  });

  const transcribe = useCallback(async (file: File) => {
    setState({ isProcessing: true, error: null, transcription: null });

    try {
      const formData = new FormData();
      formData.append('audio', file);

      const response = await fetch(
        '/api/transcribe',
        {
          method: 'POST',
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Transcription failed');
      }

      if (!data.text) {
        throw new Error('No transcription received from API');
      }

      setState({
        isProcessing: false,
        error: null,
        transcription: data.text,
      });

      return data.text;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      setState({
        isProcessing: false,
        error: errorMessage,
        transcription: null,
      });
      throw error;
    }
  }, []);

  const reset = useCallback(() => {
    setState({
      isProcessing: false,
      error: null,
      transcription: null,
    });
  }, []);

  return {
    ...state,
    transcribe,
    reset,
  };
}
