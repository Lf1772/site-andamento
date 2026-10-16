import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/auth";
import { query } from "@/lib/db";
import { HttpError, isUuid, json, withUser } from "@/lib/http";
import { getAnaliseForUser } from "@/lib/processos";

type Ctx = { params: Promise<{ id: string }> };

/** Registra a revisão humana: somente após ela o andamento pode ser copiado ou baixado. */
export const POST = withUser<Ctx>(async (req, ctx) => {
  const { id } = await ctx.params;
  if (!isUuid(id)) throw new HttpError(404, "Análise não encontrada.");
  const a = await getAnaliseForUser(ctx.user, id);
  if (a.status !== "concluida" || !a.andamento) throw new HttpError(400, "Não há andamento para aprovar.");
  const body = (await req.json().catch(() => ({}))) as { revogar?: boolean };
  if (body.revogar) {
    await query("UPDATE analises SET aprovado_por = NULL, aprovado_em = NULL, updated_at = now() WHERE id = $1", [a.id]);
  } else {
    await query("UPDATE analises SET aprovado_por = $2, aprovado_em = now(), salvo_no_historico = true, updated_at = now() WHERE id = $1", [a.id, ctx.user.id]);
    await query("UPDATE processos SET updated_at = now() WHERE id = $1", [a.processo_id]);
  }
  await audit({
    escritorioId: ctx.user.escritorioId,
    usuarioId: ctx.user.id,
    acao: body.revogar ? "aprovacao_revogada" : "andamento_aprovado",
    entidade: "analise",
    entidadeId: a.id,
    ip: await clientIp(),
  });
  return json({ ok: true });
});
