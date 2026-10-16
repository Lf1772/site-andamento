import "server-only";

function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export const config = {
  aiModel: process.env.AI_MODEL || "claude-opus-5-5",
  aiFallbacks: (process.env.AI_FALLBACKS || "default") !== "off",
  storageDir: process.env.STORAGE_DIR || "./storage",
  maxFileBytes: num("MAX_FILE_MB", 200) * 1024 * 1024,
  maxPagesPerDocument: num("MAX_PAGES_PER_DOCUMENT", 3000),
  maxTokensPerAnalysis: num("MAX_TOKENS_PER_ANALYSIS", 1_500_000),
  singlePassTokenLimit: num("SINGLE_PASS_TOKEN_LIMIT", 300_000),
  maxOcrPagesPerDocument: num("MAX_OCR_PAGES_PER_DOCUMENT", 400),
  sessionHours: num("SESSION_HOURS", 12),
};

// Preço por milhão de tokens (USD), usado apenas para estimativa de custos exibida internamente.
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-fable-5-1": { input: 10, output: 50 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};

export function estimateCostUsd(model: string, input: number, output: number): number {
  const p = PRICES[model] ?? PRICES["claude-opus-5-5"];
  return (input * p.input + output * p.output) / 1_000_000;
}
