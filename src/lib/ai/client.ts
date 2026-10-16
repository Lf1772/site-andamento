import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaContentBlockParam, BetaTextBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { z } from "zod/v4";
import { config, estimateCostUsd } from "../config";

// A chave da API é lida de ANTHROPIC_API_KEY, apenas no servidor.
let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ maxRetries: 4, timeout: 30 * 60 * 1000 });
  return client;
}

export class AiError extends Error {}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  model: string;
}

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    costUsd: a.costUsd + b.costUsd,
    model: b.model || a.model,
  };
}

export const emptyUsage = (): Usage => ({ inputTokens: 0, outputTokens: 0, costUsd: 0, model: config.aiModel });

/** Estimativa conservadora de tokens a partir do número de caracteres (português). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.2);
}

/**
 * Chamada ao modelo com saída estruturada validada por Zod.
 * Usa streaming (entradas e saídas longas), pensamento adaptativo e
 * reexecução automática em modelo alternativo em caso de recusa.
 */
export async function callStructured<S extends z.ZodType>(params: {
  system: string;
  content: BetaContentBlockParam[];
  schema: S;
  effort: "low" | "medium" | "high" | "xhigh";
  maxTokens?: number;
}): Promise<{ data: z.infer<S>; usage: Usage }> {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new AiError("A chave da API de inteligência artificial não está configurada no servidor.");
  }
  const system: BetaTextBlockParam[] = [{ type: "text", text: params.system, cache_control: { type: "ephemeral" } }];
  let message;
  try {
    const stream = getClient().beta.messages.stream({
      model: config.aiModel,
      max_tokens: params.maxTokens ?? 64000,
      system,
      thinking: { type: "adaptive" },
      output_config: { effort: params.effort, format: betaZodOutputFormat(params.schema) },
      messages: [{ role: "user", content: params.content }],
      ...(config.aiFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
    message = await stream.finalMessage();
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new AiError("Credencial da API de IA inválida. Verifique a configuração do servidor.");
    if (err instanceof Anthropic.RateLimitError) throw new AiError("Limite de uso da API de IA atingido. Tente novamente em alguns minutos.");
    if (err instanceof Anthropic.BadRequestError) throw new AiError(`A API de IA rejeitou a solicitação: ${err.message}`);
    if (err instanceof Anthropic.APIConnectionError) throw new AiError("Falha de conexão com a API de IA. Tente novamente.");
    if (err instanceof Anthropic.APIError) throw new AiError(`Erro na API de IA (${err.status ?? "sem status"}). Tente novamente.`);
    throw err;
  }

  const usage: Usage = {
    inputTokens:
      message.usage.input_tokens + (message.usage.cache_creation_input_tokens ?? 0) + (message.usage.cache_read_input_tokens ?? 0),
    outputTokens: message.usage.output_tokens,
    costUsd: estimateCostUsd(
      message.model,
      message.usage.input_tokens + (message.usage.cache_creation_input_tokens ?? 0) * 1.25 + (message.usage.cache_read_input_tokens ?? 0) * 0.1,
      message.usage.output_tokens,
    ),
    model: message.model,
  };

  if (message.stop_reason === "refusal") {
    throw new AiError("O modelo de IA recusou processar este conteúdo. Revise os documentos enviados ou faça o andamento manualmente.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new AiError("A resposta da IA excedeu o tamanho máximo permitido. Tente dividir os documentos.");
  }
  const text = message.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AiError("A IA retornou uma resposta em formato inesperado. Tente novamente.");
  }
  const result = params.schema.safeParse(parsed);
  if (!result.success) throw new AiError("A IA retornou dados incompletos. Tente novamente.");
  return { data: result.data, usage };
}
