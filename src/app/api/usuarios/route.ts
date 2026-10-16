import bcrypt from "bcryptjs";
import { z } from "zod/v4";
import { audit } from "@/lib/audit";
import { can, clientIp } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { HttpError, json, withUser } from "@/lib/http";

const Body = z.object({
  nome: z.string().trim().min(2).max(200),
  email: z.string().trim().toLowerCase().email().max(200),
  senha: z.string().min(12).max(200),
  papel: z.enum(["admin", "advogado", "estagiario"]),
});

export const POST = withUser(
  async (req, { user }) => {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Dados inválidos. A senha deve ter ao menos 12 caracteres.");
    const d = parsed.data;
    if (await queryOne("SELECT 1 FROM usuarios WHERE email = $1", [d.email])) throw new HttpError(409, "Já existe um usuário com este e-mail.");
    const row = await queryOne<{ id: string }>(
      "INSERT INTO usuarios (escritorio_id, nome, email, senha_hash, papel) VALUES ($1,$2,$3,$4,$5) RETURNING id",
      [user.escritorioId, d.nome, d.email, await bcrypt.hash(d.senha, 12), d.papel],
    );
    await audit({ escritorioId: user.escritorioId, usuarioId: user.id, acao: "usuario_criado", entidade: "usuario", entidadeId: row!.id, detalhes: { email: d.email, papel: d.papel }, ip: await clientIp() });
    return json({ id: row!.id }, 201);
  },
  { permission: can.gerenciarUsuarios },
);
