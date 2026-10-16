import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/auth";
import { HttpError, isUuid, json, withUser } from "@/lib/http";
import { getAnaliseForUser } from "@/lib/processos";

type Ctx = { params: Promise<{ id: string }> };

/** Registra na auditoria que o andamento foi copiado para envio. */
export const POST = withUser<Ctx>(async (_req, ctx) => {
  const { id } = await ctx.params;
  if (!isUuid(id)) throw new HttpError(404, "Análise não encontrada.");
  const a = await getAnaliseForUser(ctx.user, id);
  if (!a.aprovado_em) throw new HttpError(403, "O andamento precisa ser aprovado antes de ser copiado.");
  await audit({ escritorioId: ctx.user.escritorioId, usuarioId: ctx.user.id, acao: "andamento_copiado", entidade: "analise", entidadeId: a.id, ip: await clientIp() });
  return json({ ok: true });
});
