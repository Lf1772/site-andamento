import { z } from "zod/v4";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/auth";
import { query } from "@/lib/db";
import { HttpError, isUuid, json, withUser } from "@/lib/http";
import { CamposRevisaoSchema } from "@/lib/ai/schemas";
import { failStaleAnalyses, getAnaliseForUser } from "@/lib/processos";

type Ctx = { params: Promise<{ id: string }> };

async function load(ctx: Ctx & { user: Parameters<typeof getAnaliseForUser>[0] }) {
  const { id } = await ctx.params;
  if (!isUuid(id)) throw new HttpError(404, "Análise não encontrada.");
  return getAnaliseForUser(ctx.user, id);
}

export const GET = withUser<Ctx>(async (_req, ctx) => {
  await failStaleAnalyses();
  const a = await load(ctx);
  return json({ id: a.id, status: a.status, progresso: a.progresso, erro: a.erro });
});

const Patch = z.object({
  campos: CamposRevisaoSchema.optional(),
  andamento: z.string().trim().min(1).max(8000).optional(),
  salvar_no_historico: z.boolean().optional(),
});

/** Salva edições do revisor. Qualquer alteração de conteúdo exige nova aprovação. */
export const PATCH = withUser<Ctx>(async (req, ctx) => {
  const a = await load(ctx);
  if (a.status !== "concluida") throw new HttpError(400, "A análise ainda não foi concluída.");
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Dados inválidos. Verifique o tamanho dos campos.");
  const { campos, andamento, salvar_no_historico } = parsed.data;

  const camposMudaram = campos && JSON.stringify(campos) !== JSON.stringify(a.campos);
  const andamentoMudou = andamento !== undefined && andamento !== a.andamento;
  if (camposMudaram || andamentoMudou) {
    await query(
      `UPDATE analises SET campos = COALESCE($2, campos), andamento = COALESCE($3, andamento),
              aprovado_por = NULL, aprovado_em = NULL, updated_at = now() WHERE id = $1`,
      [a.id, camposMudaram ? JSON.stringify(campos) : null, andamentoMudou ? andamento : null],
    );
    if (andamentoMudou) {
      await query("INSERT INTO andamento_versoes (analise_id, texto, variante, origem, criado_por) VALUES ($1,$2,$3,'edicao_manual',$4)", [
        a.id,
        andamento,
        a.variante,
        ctx.user.id,
      ]);
    }
  }
  if (salvar_no_historico) {
    await query("UPDATE analises SET salvo_no_historico = true, updated_at = now() WHERE id = $1", [a.id]);
    await query("UPDATE processos SET updated_at = now() WHERE id = $1", [a.processo_id]);
  }
  if (camposMudaram || andamentoMudou || salvar_no_historico) {
    await audit({
      escritorioId: ctx.user.escritorioId,
      usuarioId: ctx.user.id,
      acao: salvar_no_historico ? "andamento_salvo_no_historico" : "revisao_editada",
      entidade: "analise",
      entidadeId: a.id,
      detalhes: { campos: !!camposMudaram, andamento: andamentoMudou },
      ip: await clientIp(),
    });
  }
  return json({ ok: true, aprovacao_reiniciada: !!(camposMudaram || andamentoMudou) });
});
