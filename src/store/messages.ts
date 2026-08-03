import { create } from 'zustand';
import { supabase } from '@/src/db/supabase';
import type { Database } from '@/src/db/types';
import type { ToolEventRecord } from '@/src/llm/types';

export type Message = Database['public']['Tables']['messages']['Row'];

type State = {
  byConv: Record<string, Message[]>;
  streaming: Record<string, string>; // partial assistant text per conversation
  streamingTool: Record<string, ToolEventRecord | null>; // in-flight tool call per conversation
  loading: Record<string, boolean>;

  load: (conversationId: string) => Promise<void>;
  appendLocal: (msg: Message) => void;
  setStreaming: (conversationId: string, text: string) => void;
  clearStreaming: (conversationId: string) => void;
  setStreamingTool: (conversationId: string, t: ToolEventRecord | null) => void;
  subscribe: (conversationId: string) => () => void;
};

export const useMessages = create<State>((set) => ({
  byConv: {},
  streaming: {},
  streamingTool: {},
  loading: {},

  load: async (conversationId) => {
    set((s) => ({ loading: { ...s.loading, [conversationId]: true } }));
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (!error && data) {
      set((s) => ({
        byConv: { ...s.byConv, [conversationId]: data },
        loading: { ...s.loading, [conversationId]: false },
      }));
    } else {
      set((s) => ({ loading: { ...s.loading, [conversationId]: false } }));
    }
  },

  appendLocal: (msg) =>
    set((s) => {
      const existing = s.byConv[msg.conversation_id] ?? [];
      // dedupe by id
      if (existing.some((m) => m.id === msg.id)) return {};
      return {
        byConv: {
          ...s.byConv,
          [msg.conversation_id]: [...existing, msg],
        },
      };
    }),

  setStreaming: (conversationId, text) =>
    set((s) => ({ streaming: { ...s.streaming, [conversationId]: text } })),

  clearStreaming: (conversationId) =>
    set((s) => {
      const next = { ...s.streaming };
      delete next[conversationId];
      return { streaming: next, streamingTool: { ...s.streamingTool, [conversationId]: null } };
    }),

  setStreamingTool: (conversationId, t) =>
    set((s) => ({ streamingTool: { ...s.streamingTool, [conversationId]: t } })),

  subscribe: (conversationId) => {
    const ch = supabase
      .channel(`msg-rt-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          set((s) => {
            const existing = s.byConv[conversationId] ?? [];
            if (existing.some((m) => m.id === msg.id)) return {};
            return {
              byConv: {
                ...s.byConv,
                [conversationId]: [...existing, msg],
              },
            };
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  },
}));
