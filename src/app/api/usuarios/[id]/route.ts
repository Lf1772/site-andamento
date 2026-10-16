import bcrypt from "bcryptjs";
import { z } from "zod/v4";
import { audit } from "@/lib/audit";
import { can, clientIp } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { HttpError, isUuid, json, withUser } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  papel: z.enum(["admin", "advogado", "estagiario"]).optional(),
  ativo: z.boolean().optional(),
  senha: z.string().min(12).max(200).optional(),
});

export const PATCH = withUser<Ctx>(
  async (req, ctx) => {
    const { id } = await ctx.params;
    if (!isUuid(id)) throw new HttpError(404, "Usuário não encontrado.");
    const alvo = await queryOne<{ id: string }>("SELECT id FROM usuarios WHERE id = $1 AND escritorio_id = $2", [id, ctx.user.escritorioId]);
    if (!alvo) throw new HttpError(404, "Usuário não encontrado.");
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Dados inválidos. A senha deve ter ao menos 12 caracteres.");
    const d = parsed.data;
    if (id === ctx.user.id && (d.ativo === false || (d.papel && d.papel !== "admin"))) {
      throw new HttpError(400, "Você não pode desativar ou rebaixar a própria conta.");
    }
    if (d.papel) await query("UPDATE usuarios SET papel = $2 WHERE id = $1", [id, d.papel]);
    if (d.ativo !== undefined) await query("UPDATE usuarios SET ativo = $2 WHERE id = $1", [id, d.ativo]);
    if (d.senha) await query("UPDATE usuarios SET senha_hash = $2 WHERE id = $1", [id, await bcrypt.hash(d.senha, 12)]);
    if (d.ativo === false || d.senha) await query("DELETE FROM sessoes WHERE usuario_id = $1", [id]);
    await audit({
      escritorioId: ctx.user.escritorioId,
      usuarioId: ctx.user.id,
      acao: "usuario_alterado",
      entidade: "usuario",
      entidadeId: id,
      detalhes: { papel: d.papel, ativo: d.ativo, senha_redefinida: !!d.senha },
      ip: await clientIp(),
    });
    return json({ ok: true });
  },
  { permission: can.gerenciarUsuarios },
);
