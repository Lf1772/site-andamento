import { z } from "zod/v4";
import { audit } from "@/lib/audit";
import { can, clientIp } from "@/lib/auth";
import { query } from "@/lib/db";
import { HttpError, isUuid, json, withUser } from "@/lib/http";
import { AREAS, getProcessoForUser } from "@/lib/processos";
import { deletePrefix } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

const Patch = z.object({
  cliente_nome: z.string().trim().min(3).max(300).optional(),
  tratamento: z.enum(["sr", "sra", "neutro"]).optional(),
  numero_processo: z.string().trim().max(100).optional(),
  parte_contraria: z.string().trim().max(300).optional(),
  posicao_cliente: z.string().trim().min(2).max(100).optional(),
  area: z.enum(AREAS).optional(),
  observacoes_internas: z.string().max(10000).optional(),
});

async function load(ctx: Ctx, user: Parameters<typeof getProcessoForUser>[0]) {
  const { id } = await ctx.params;
  if (!isUuid(id)) throw new HttpError(404, "Processo não encontrado.");
  return getProcessoForUser(user, id);
}

export const PATCH = withUser<Ctx>(async (req, ctx) => {
  const p = await load(ctx, ctx.user);
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Dados inválidos.");
  const entries = Object.entries(parsed.data).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return json({ ok: true });
  const sets = entries.map(([k], i) => `${k} = $${i + 2}`).join(", ");
  await query(`UPDATE processos SET ${sets}, updated_at = now() WHERE id = $1`, [
    p.id,
    ...entries.map(([k, v]) => (k === "numero_processo" || k === "parte_contraria" ? (v as string) || null : v)),
  ]);
  await audit({
    escritorioId: ctx.user.escritorioId,
    usuarioId: ctx.user.id,
    acao: "processo_alterado",
    entidade: "processo",
    entidadeId: p.id,
    detalhes: { campos: entries.map(([k]) => k) },
    ip: await clientIp(),
  });
  return json({ ok: true });
});

export const DELETE = withUser<Ctx>(
  async (_req, ctx) => {
    const p = await load(ctx, ctx.user);
    await query("DELETE FROM processos WHERE id = $1", [p.id]);
    await deletePrefix(`${p.escritorio_id}/${p.id}`);
    await audit({
      escritorioId: ctx.user.escritorioId,
      usuarioId: ctx.user.id,
      acao: "processo_excluido",
      entidade: "processo",
      entidadeId: p.id,
      detalhes: { cliente: p.cliente_nome, numero: p.numero_processo },
      ip: await clientIp(),
    });
    return json({ ok: true });
  },
  { permission: can.excluirProcesso },
);
