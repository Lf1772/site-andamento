import bcrypt from "bcryptjs";
import { z } from "zod/v4";
import { audit } from "@/lib/audit";
import { clientIp, createSession } from "@/lib/auth";
import { queryOne, query } from "@/lib/db";
import { errorResponse, HttpError, json } from "@/lib/http";
import { clearHits, isRateLimited, registerHit } from "@/lib/ratelimit";

const Body = z.object({ email: z.string().email().max(200), senha: z.string().min(1).max(200) });
const WINDOW = 15 * 60 * 1000;
// Hash fictício para manter tempo de resposta constante quando o e-mail não existe.
const DUMMY_HASH = "$2a$12$CwTycUXWue0Thq9StjUM0uJ8.dZ3Lr3lC0yTq4eK1zXr7l5bF1Yy6";

export async function POST(req: Request) {
  try {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    if (!origin || !host || new URL(origin).host !== host) throw new HttpError(403, "Origem não permitida.");

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Informe e-mail e senha válidos.");
    const email = parsed.data.email.trim().toLowerCase();
    const ip = (await clientIp()) ?? "desconhecido";
    const key = `login:${ip}:${email}`;
    if (isRateLimited(key, 5, WINDOW) || isRateLimited(`login-ip:${ip}`, 30, WINDOW)) {
      throw new HttpError(429, "Muitas tentativas. Aguarde 15 minutos e tente novamente.");
    }
    const user = await queryOne<{ id: string; senha_hash: string; ativo: boolean; escritorio_id: string }>(
      "SELECT id, senha_hash, ativo, escritorio_id FROM usuarios WHERE email = $1",
      [email],
    );
    const ok = await bcrypt.compare(parsed.data.senha, user?.senha_hash ?? DUMMY_HASH);
    if (!user || !ok || !user.ativo) {
      registerHit(key, WINDOW);
      registerHit(`login-ip:${ip}`, WINDOW);
      await audit({ escritorioId: user?.escritorio_id ?? null, usuarioId: user?.id ?? null, acao: "login_falhou", detalhes: { email }, ip });
      throw new HttpError(401, "E-mail ou senha incorretos.");
    }
    clearHits(key);
    await createSession(user.id);
    await query("UPDATE usuarios SET ultimo_login = now() WHERE id = $1", [user.id]);
    await query("DELETE FROM sessoes WHERE expires_at < now()");
    await audit({ escritorioId: user.escritorio_id, usuarioId: user.id, acao: "login", ip });
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
