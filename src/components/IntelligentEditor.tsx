import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, RotateCcw, Eye, EyeOff, Plus, X, Settings2, Pencil, Check, ChevronDown, ChevronUp, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useQuickActions } from '@/hooks/useQuickActions';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface IntelligentEditorProps {
  textoOriginal: string;
  textoEditado: string;
  onTextoEditadoChange: (texto: string) => void;
  onSave: () => Promise<void>;
  isSaving: boolean;
}

// Quick actions are now persisted in the database via useQuickActions hook

export function IntelligentEditor({
  textoOriginal,
  textoEditado,
  onTextoEditadoChange,
  onSave,
  isSaving,
}: IntelligentEditorProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const { actions: quickActionsData, labels: quickActions, addAction, removeAction, updateAction } = useQuickActions();
  const [newAction, setNewAction] = useState('');
  const [isManagingActions, setIsManagingActions] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [actionsOpen, setActionsOpen] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Sync editor content when textoEditado changes externally (e.g. from LLM)
  const lastExternalText = useRef(textoEditado);
  useEffect(() => {
    if (editorRef.current && textoEditado !== lastExternalText.current) {
      editorRef.current.innerHTML = textoEditado;
      lastExternalText.current = textoEditado;
    }
  }, [textoEditado]);

  // Initial mount sync
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = textoEditado;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEditorInput = useCallback(() => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      lastExternalText.current = html;
      onTextoEditadoChange(html);
    }
  }, [onTextoEditadoChange]);

  const handleAddAction = () => {
    const trimmed = newAction.trim();
    if (!trimmed || quickActions.includes(trimmed)) return;
    addAction(trimmed);
    setNewAction('');
  };

  const handleRemoveAction = (index: number) => {
    const action = quickActionsData[index];
    if (action) removeAction(action.id);
    if (editingIndex === index) {
      setEditingIndex(null);
      setEditingValue('');
    }
  };

  const handleStartEdit = (index: number) => {
    setEditingIndex(index);
    setEditingValue(quickActions[index]);
  };

  const handleSaveEdit = () => {
    if (editingIndex === null) return;
    const trimmed = editingValue.trim();
    if (!trimmed) return;
    const action = quickActionsData[editingIndex];
    if (action) updateAction(action.id, trimmed);
    setEditingIndex(null);
    setEditingValue('');
  };

  const handleSubmit = async () => {
    if (!input.trim() || isProcessing) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsProcessing(true);

    try {
      const response = await fetch(
        '/api/edit-text',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: textoEditado,
            instruction: userMessage.content,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error processing edit');
      }

      onTextoEditadoChange(data.editedText);

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '✓ Texto actualizado según tu instrucción.',
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Error desconocido'}`,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleReset = () => {
    onTextoEditadoChange(textoOriginal);
    setMessages([]);
  };

  const handleQuickAction = (action: string) => {
    if (isProcessing) return;
    setInput(action);
    // Auto-submit the quick action
    setTimeout(() => {
      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: action,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, userMessage]);
      setIsProcessing(true);
      fetch(
        '/api/edit-text',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text: textoEditado, instruction: action }),
        }
      )
        .then(res => res.json().then(data => ({ ok: res.ok, data })))
        .then(({ ok, data }) => {
          if (!ok) throw new Error(data.error || 'Error processing edit');
          onTextoEditadoChange(data.editedText);
          setMessages(prev => [...prev, {
            id: (Date.now() + 1).toString(),
            role: 'assistant' as const,
            content: '✓ Texto actualizado según tu instrucción.',
            timestamp: new Date(),
          }]);
        })
        .catch(error => {
          setMessages(prev => [...prev, {
            id: (Date.now() + 1).toString(),
            role: 'assistant' as const,
            content: `Error: ${error instanceof Error ? error.message : 'Error desconocido'}`,
            timestamp: new Date(),
          }]);
        })
        .finally(() => {
          setIsProcessing(false);
          setInput('');
        });
    }, 0);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-auto lg:h-[600px] w-full min-w-0 overflow-x-hidden">
      {/* Text Panel */}
      <div className="flex-1 min-w-0 flex flex-col border border-border rounded-xl bg-card overflow-hidden">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 border-b border-border bg-muted/30 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="font-semibold text-sm truncate">
              {showOriginal ? 'Texto Original' : 'Texto Editado'}
            </h3>
            <span className="text-xs text-muted-foreground truncate">
              {showOriginal ? '(solo lectura)' : '(modificable)'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const textToCopy = showOriginal ? textoOriginal : textoEditado;
                const plainText = textToCopy.replace(/<[^>]*>/g, '');
                navigator.clipboard.writeText(plainText);
                import('sonner').then(({ toast }) => toast.success('Texto copiado'));
              }}
              className="gap-2 max-w-full"
            >
              <Copy className="w-4 h-4 shrink-0" />
              <span className="truncate">Copiar todo</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowOriginal(!showOriginal)}
              className="gap-2 max-w-full"
            >
              {showOriginal ? <EyeOff className="w-4 h-4 shrink-0" /> : <Eye className="w-4 h-4 shrink-0" />}
              <span className="truncate">{showOriginal ? 'Ver editado' : 'Ver original'}</span>
            </Button>
            {!showOriginal && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="gap-2 max-w-full"
              >
                <RotateCcw className="w-4 h-4 shrink-0" />
                <span className="truncate">Restaurar</span>
              </Button>
            )}
          </div>
        </div>

        <ScrollArea className="flex-1 min-w-0">
          <div className="p-4 min-w-0">
            {showOriginal ? (
              <p className="text-foreground whitespace-pre-wrap break-words leading-relaxed">
                {textoOriginal}
              </p>
            ) : (
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={handleEditorInput}
                className="min-h-[320px] lg:min-h-[400px] w-full max-w-full outline-none whitespace-pre-wrap break-words leading-relaxed text-sm text-foreground [&_b]:font-bold"
                style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
              />
            )}
          </div>
        </ScrollArea>

        {!showOriginal && (
          <div className="p-3 border-t border-border">
            <Button
              onClick={onSave}
              disabled={isSaving}
              className="w-full"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                'Guardar cambios'
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Chat Panel */}
      <div className="w-full min-w-0 lg:w-96 lg:max-w-[24rem] flex flex-col border border-border rounded-xl bg-card overflow-hidden">
        <div className="p-3 border-b border-border bg-muted/30 flex items-center justify-between gap-2 min-w-0">
          <div className="min-w-0">
            <h3 className="font-semibold text-sm truncate">Editor Inteligente</h3>
            <p className="text-xs text-muted-foreground truncate">
              Describe cómo quieres modificar el texto
            </p>
          </div>
          <Popover open={isManagingActions} onOpenChange={setIsManagingActions}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                <Settings2 className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[min(20rem,calc(100vw-2rem))]" align="end">
              <div className="space-y-3">
                <h4 className="font-medium text-sm">Gestionar acciones rápidas</h4>

                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {quickActions.map((action, index) => (
                    <div key={index} className="flex items-center gap-2 group min-w-0">
                      {editingIndex === index ? (
                        <>
                          <Input
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            className="text-xs h-7 flex-1 min-w-0"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSaveEdit();
                              }
                              if (e.key === 'Escape') {
                                setEditingIndex(null);
                                setEditingValue('');
                              }
                            }}
                            autoFocus
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 flex-shrink-0"
                            onClick={handleSaveEdit}
                          >
                            <Check className="w-3 h-3" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <span className="text-xs flex-1 truncate">{action}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0"
                            onClick={() => handleStartEdit(index)}
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0"
                            onClick={() => handleRemoveAction(index)}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  ))}
                  {quickActions.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      No hay acciones rápidas
                    </p>
                  )}
                </div>

                <div className="flex gap-2 min-w-0">
                  <Input
                    value={newAction}
                    onChange={(e) => setNewAction(e.target.value)}
                    placeholder="Nueva acción rápida..."
                    className="text-xs h-8 min-w-0"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddAction();
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    className="h-8 w-8 flex-shrink-0"
                    onClick={handleAddAction}
                    disabled={!newAction.trim()}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <ScrollArea className="flex-1 min-w-0">
          <div className="p-4 space-y-4 min-w-0">
            {quickActions.length > 0 && (
              <Collapsible open={actionsOpen} onOpenChange={setActionsOpen}>
                <CollapsibleTrigger asChild>
                  <button className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1.5 rounded-md hover:bg-muted/50">
                    Acciones rápidas ({quickActions.length})
                    {actionsOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-1.5 min-w-0">
                  {quickActions.map((action, index) => (
                    <div key={index} className="flex items-center gap-1 group min-w-0">
                      {editingIndex === index ? (
                        <>
                          <Input
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            className="text-xs h-7 flex-1 min-w-0"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); handleSaveEdit(); }
                              if (e.key === 'Escape') { setEditingIndex(null); setEditingValue(''); }
                            }}
                            autoFocus
                          />
                          <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={handleSaveEdit}>
                            <Check className="w-3 h-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={() => { setEditingIndex(null); setEditingValue(''); }}>
                            <X className="w-3 h-3" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleQuickAction(action)}
                            disabled={isProcessing}
                            className="text-xs px-3 py-1.5 rounded-full bg-muted hover:bg-muted/80 text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-1 min-w-0 text-left truncate"
                          >
                            {action}
                          </button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0"
                            onClick={() => handleStartEdit(index)}
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0"
                            onClick={() => handleRemoveAction(index)}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'flex min-w-0',
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={cn(
                    'max-w-[85%] break-words rounded-lg px-3 py-2 text-sm',
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground'
                  )}
                >
                  {message.content}
                </div>
              </div>
            ))}

            {isProcessing && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-3 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        <div className="p-3 border-t border-border">
          <div className="flex gap-2 min-w-0">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe una instrucción..."
              className="min-h-[44px] max-h-32 resize-none min-w-0"
              disabled={isProcessing}
            />
            <Button
              onClick={handleSubmit}
              disabled={!input.trim() || isProcessing}
              size="icon"
              className="flex-shrink-0"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
