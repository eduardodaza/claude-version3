import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface QuickAction {
  id: string;
  label: string;
  position: number;
}

export function useQuickActions() {
  const [actions, setActions] = useState<QuickAction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchActions = useCallback(async () => {
    const { data, error } = await supabase
      .from('quick_actions')
      .select('*')
      .order('position', { ascending: true });

    if (!error && data) {
      setActions(data as QuickAction[]);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchActions();
  }, [fetchActions]);

  const addAction = useCallback(async (label: string) => {
    const position = actions.length;
    const { data, error } = await supabase
      .from('quick_actions')
      .insert({ label, position })
      .select()
      .single();

    if (!error && data) {
      setActions(prev => [...prev, data as QuickAction]);
    }
  }, [actions.length]);

  const removeAction = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('quick_actions')
      .delete()
      .eq('id', id);

    if (!error) {
      setActions(prev => prev.filter(a => a.id !== id));
    }
  }, []);

  const updateAction = useCallback(async (id: string, label: string) => {
    const { error } = await supabase
      .from('quick_actions')
      .update({ label })
      .eq('id', id);

    if (!error) {
      setActions(prev => prev.map(a => a.id === id ? { ...a, label } : a));
    }
  }, []);

  const labels = actions.map(a => a.label);

  return { actions, labels, isLoading, addAction, removeAction, updateAction };
}
