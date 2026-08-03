import * as FileSystem from 'expo-file-system/legacy';
import type { ChatRequest, LLMProvider, StreamHandler } from './types';

const MODEL_URL = process.env.EXPO_PUBLIC_MODEL_URL!;
const MODEL_FILENAME = process.env.EXPO_PUBLIC_MODEL_FILENAME ?? 'model.gguf';

/**
 * Resolve absolute path where model lives on device.
 */
export function modelPath() {
  return `${FileSystem.documentDirectory}${MODEL_FILENAME}`;
}

export async function isModelDownloaded(): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(modelPath());
  return info.exists && (info.size ?? 0) > 100 * 1024 * 1024; // sanity: >100MB
}

export type DownloadProgress = {
  bytesWritten: number;
  totalBytes: number;
  pct: number;
};

export async function downloadModel(
  onProgress?: (p: DownloadProgress) => void,
): Promise<string> {
  const dest = modelPath();
  const dl = FileSystem.createDownloadResumable(
    MODEL_URL,
    dest,
    {},
    (data) => {
      onProgress?.({
        bytesWritten: data.totalBytesWritten,
        totalBytes: data.totalBytesExpectedToWrite,
        pct:
          data.totalBytesExpectedToWrite > 0
            ? data.totalBytesWritten / data.totalBytesExpectedToWrite
            : 0,
      });
    },
  );
  const result = await dl.downloadAsync();
  if (!result?.uri) throw new Error('Model download failed');
  return result.uri;
}

// ────────────────────────────────────────────────────────────────────────────
// llama.rn binding. Lazy-loaded so JS can boot without native module
// (e.g. on web / before dev-client built).
// ────────────────────────────────────────────────────────────────────────────

type LlamaContext = {
  completion: (
    params: Record<string, unknown>,
    onToken: (data: { token: string }) => void,
  ) => Promise<{ tokens_predicted?: number; tokens_evaluated?: number }>;
  release: () => Promise<void>;
};

let ctx: LlamaContext | null = null;

export class LocalModelNotReadyError extends Error {
  constructor(message = 'Local model not downloaded. Open Settings → Download model.') {
    super(message);
    this.name = 'LocalModelNotReadyError';
  }
}

async function getCtx(): Promise<LlamaContext> {
  if (ctx) return ctx;
  if (!(await isModelDownloaded())) throw new LocalModelNotReadyError();
  // Dynamic import so non-native environments don't crash on require.
  const { initLlama } = await import('llama.rn');
  ctx = (await initLlama({
    model: modelPath(),
    n_ctx: 4096,
    n_gpu_layers: 0,
  })) as unknown as LlamaContext;
  return ctx;
}

export async function releaseLocal() {
  if (ctx) {
    await ctx.release();
    ctx = null;
  }
}

function buildPrompt(req: ChatRequest): string {
  // Gemma chat template
  const parts: string[] = [];
  for (const m of req.messages) {
    const role = m.role === 'assistant' ? 'model' : 'user';
    parts.push(`<start_of_turn>${role}\n${m.content}<end_of_turn>`);
  }
  parts.push('<start_of_turn>model\n');
  return parts.join('\n');
}

export const localProvider: LLMProvider = {
  async chat(req: ChatRequest, onEvent: StreamHandler) {
    try {
      const c = await getCtx();
      const prompt = buildPrompt(req);
      const result = await c.completion(
        {
          prompt,
          n_predict: 512,
          temperature: 0.7,
          top_p: 0.9,
          stop: ['<end_of_turn>', '<start_of_turn>'],
        },
        (data) => {
          if (req.signal?.aborted) return;
          onEvent({ type: 'token', text: data.token });
        },
      );
      onEvent({
        type: 'done',
        tokensIn: result.tokens_evaluated,
        tokensOut: result.tokens_predicted,
        model: MODEL_FILENAME.replace(/\.gguf$/i, ''),
      });
    } catch (e) {
      onEvent({ type: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  },
};
