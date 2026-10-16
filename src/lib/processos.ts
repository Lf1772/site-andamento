import "server-only";
import type { SessionUser } from "./auth";
import { query, queryOne } from "./db";
import { HttpError } from "./http";
import type { Analise, CamposRevisao } from "./ai/schemas";

export interface ProcessoRow {
  id: string;
  escritorio_id: string;
  cliente_nome: string;
  tratamento: "sr" | "sra" | "neutro";
  numero_processo: string | null;
  parte_contraria: string | null;
  posicao_cliente: string;
  area: string;
  observacoes_internas: string;
  ultima_analise_em: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface AnaliseRow {
  id: string;
  processo_id: string;
  escritorio_id: string;
  solicitado_por: string | null;
  analise_anterior_id: string | null;
  tipo: "inicial" | "atualizacao";
  status: "na_fila" | "extraindo" | "analisando" | "redigindo" | "concluida" | "erro";
  progresso: string | null;
  erro: string | null;
  resultado: (Analise & { _meta?: { modo: string; documentos: Record<string, string> } }) | null;
  campos: CamposRevisao | null;
  andamento: string | null;
  variante: string;
  formalidade: string;
  aprovado_por: string | null;
  aprovado_em: Date | null;
  salvo_no_historico: boolean;
  modelo: string | null;
  tokens_entrada: string;
  tokens_saida: string;
  custo_estimado_usd: string;
  created_at: Date;
  updated_at: Date;
}

/** Carrega um processo garantindo que pertence ao escritório do usuário. */
export async function getProcessoForUser(user: SessionUser, id: string): Promise<ProcessoRow> {
  const p = await queryOne<ProcessoRow>("SELECT * FROM processos WHERE id = $1 AND escritorio_id = $2", [id, user.escritorioId]);
  if (!p) throw new HttpError(404, "Processo não encontrado.");
  return p;
}

export async function getAnaliseForUser(user: SessionUser, id: string): Promise<AnaliseRow> {
  const a = await queryOne<AnaliseRow>("SELECT * FROM analises WHERE id = $1 AND escritorio_id = $2", [id, user.escritorioId]);
  if (!a) throw new HttpError(404, "Análise não encontrada.");
  return a;
}

/** Marca como interrompidas análises que ficaram presas (ex.: reinício do servidor). */
export async function failStaleAnalyses(): Promise<void> {
  await query(
    `UPDATE analises SET status = 'erro', erro = 'A análise foi interrompida (o servidor pode ter sido reiniciado). Inicie uma nova análise.'
      WHERE status IN ('na_fila','extraindo','analisando','redigindo') AND updated_at < now() - interval '45 minutes'`,
  );
}

export const POSICOES = [
  "Reclamante",
  "Reclamado(a)",
  "Autor(a)",
  "Réu/Ré",
  "Recorrente",
  "Recorrido(a)",
  "Exequente",
  "Executado(a)",
  "Requerente",
  "Requerido(a)",
  "Impetrante",
  "Terceiro interessado",
] as const;

export const AREAS = ["trabalhista", "cível", "previdenciário", "família", "consumidor", "tributário", "criminal", "administrativo", "outra"] as const;
