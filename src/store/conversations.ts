import { create } from 'zustand';
import { supabase } from '@/src/db/supabase';
import type { Database } from '@/src/db/types';

export type Conversation = Database['public']['Tables']['conversations']['Row'];

type State = {
  list: Conversation[];
  loading: boolean;
  load: () => Promise<void>;
  create: (title?: string) => Promise<Conversation | null>;
  rename: (id: string, title: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  subscribe: () => () => void;
};

export const useConversations = create<State>((set, get) => ({
  list: [],
  loading: false,

  load: async () => {
    set({ loading: true });
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false });
    if (!error && data) set({ list: data });
    set({ loading: false });
  },

  create: async (title) => {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return null;
    const { data, error } = await supabase
      .from('conversations')
      .insert({ user_id: user.user.id, title: title ?? null })
      .select()
      .single();
    if (error || !data) return null;
    set((s) => ({ list: [data, ...s.list] }));
    return data;
  },

  rename: async (id, title) => {
    await supabase.from('conversations').update({ title }).eq('id', id);
    set((s) => ({
      list: s.list.map((c) => (c.id === id ? { ...c, title } : c)),
    }));
  },

  remove: async (id) => {
    await supabase.from('conversations').delete().eq('id', id);
    set((s) => ({ list: s.list.filter((c) => c.id !== id) }));
  },

  subscribe: () => {
    const ch = supabase
      .channel('conversations-rt')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        () => {
          // simple: refetch on any change
          get().load();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  },
}));
