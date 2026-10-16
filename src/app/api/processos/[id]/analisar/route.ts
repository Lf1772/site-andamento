import { after } from "next/server";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/auth";
import { query, queryOne, transaction } from "@/lib/db";
import { HttpError, isUuid, json, withUser } from "@/lib/http";
import { runAnalysis } from "@/lib/jobs";
import { getProcessoForUser } from "@/lib/processos";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Inicia uma análise. Se já houver análise concluída, é uma atualização:
 * os documentos ainda não analisados são marcados como novos.
 */
export const POST = withUser<Ctx>(async (_req, ctx) => {
  const { id } = await ctx.params;
  if (!isUuid(id)) throw new HttpError(404, "Processo não encontrado.");
  const p = await getProcessoForUser(ctx.user, id);

  const emAndamento = await queryOne("SELECT id FROM analises WHERE processo_id = $1 AND status IN ('na_fila','extraindo','analisando','redigindo')", [p.id]);
  if (emAndamento) throw new HttpError(409, "Já existe uma análise em andamento para este processo.");

  const docs = await query<{ id: string; status: string }>("SELECT id, status FROM documentos WHERE processo_id = $1", [p.id]);
  if (docs.length === 0) throw new HttpError(400, "Envie ao menos um documento antes de analisar.");
  if (docs.every((d) => d.status === "erro")) throw new HttpError(400, "Nenhum documento pôde ser lido. Verifique os arquivos enviados.");

  // Base de comparação: preferencialmente a última análise salva no histórico; senão, a última concluída.
  const anterior = await queryOne<{ id: string }>(
    `SELECT id FROM analises WHERE processo_id = $1 AND status = 'concluida'
      ORDER BY salvo_no_historico DESC, created_at DESC LIMIT 1`,
    [p.id],
  );
  const jaAnalisados = anterior
    ? new Set((await query<{ documento_id: string }>("SELECT documento_id FROM analise_documentos WHERE analise_id = $1", [anterior.id])).map((r) => r.documento_id))
    : new Set<string>();
  const novos = docs.filter((d) => !jaAnalisados.has(d.id));
  if (anterior && novos.length === 0) {
    throw new HttpError(400, "Não há documentos novos desde a última análise. Envie novos documentos para atualizar, ou use “Gerar novo texto” na revisão.");
  }

  const analiseId = await transaction(async (c) => {
    const r = await c.query<{ id: string }>(
      `INSERT INTO analises (processo_id, escritorio_id, solicitado_por, analise_anterior_id, tipo, progresso)
       VALUES ($1,$2,$3,$4,$5,'Aguardando início…') RETURNING id`,
      [p.id, p.escritorio_id, ctx.user.id, anterior?.id ?? null, anterior ? "atualizacao" : "inicial"],
    );
    const aid = r.rows[0].id;
    for (const d of docs) {
      await c.query("INSERT INTO analise_documentos (analise_id, documento_id, novo) VALUES ($1,$2,$3)", [aid, d.id, !jaAnalisados.has(d.id)]);
    }
    return aid;
  });

  await audit({
    escritorioId: ctx.user.escritorioId,
    usuarioId: ctx.user.id,
    acao: anterior ? "atualizacao_solicitada" : "analise_solicitada",
    entidade: "analise",
    entidadeId: analiseId,
    detalhes: { processo: p.id, documentos: docs.length, novos: novos.length },
    ip: await clientIp(),
  });
  after(() => runAnalysis(analiseId));
  return json({ id: analiseId }, 202);
});
