import { z } from "zod/v4";
import { audit } from "@/lib/audit";
import { can, clientIp } from "@/lib/auth";
import { query } from "@/lib/db";
import { HttpError, json, withUser } from "@/lib/http";

const Body = z.object({
  nome: z.string().trim().min(2).max(200),
  assinatura: z.string().trim().max(500),
  retencao_dias: z.number().int().min(30).max(36500).nullable(),
});

export const PATCH = withUser(
  async (req, { user }) => {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Dados inválidos. A retenção mínima é de 30 dias.");
    const d = parsed.data;
    await query("UPDATE escritorios SET nome = $2, assinatura = $3, retencao_dias = $4 WHERE id = $1", [user.escritorioId, d.nome, d.assinatura || null, d.retencao_dias]);
    await audit({ escritorioId: user.escritorioId, usuarioId: user.id, acao: "configuracoes_alteradas", detalhes: d, ip: await clientIp() });
    return json({ ok: true });
  },
  { permission: can.configurarEscritorio },
);
