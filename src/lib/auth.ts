import "server-only";
import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { config } from "./config";
import { query, queryOne } from "./db";

export const SESSION_COOKIE = "sa_sessao";

export type Papel = "admin" | "advogado" | "estagiario";

export interface SessionUser {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  escritorioId: string;
  escritorioNome: string;
}

export const PAPEL_LABEL: Record<Papel, string> = {
  admin: "Administrador",
  advogado: "Advogado(a)",
  estagiario: "Estagiário(a)",
};

/** Matriz de permissões por papel. */
export const can = {
  gerenciarUsuarios: (u: SessionUser) => u.papel === "admin",
  verAuditoria: (u: SessionUser) => u.papel === "admin",
  configurarEscritorio: (u: SessionUser) => u.papel === "admin",
  excluirProcesso: (u: SessionUser) => u.papel === "admin" || u.papel === "advogado",
  excluirDocumento: (u: SessionUser) => u.papel === "admin" || u.papel === "advogado",
};

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

export async function createSession(usuarioId: string): Promise<void> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + config.sessionHours * 3600 * 1000);
  const h = await headers();
  await query("INSERT INTO sessoes (token_hash, usuario_id, expires_at, ip, user_agent) VALUES ($1,$2,$3,$4,$5)", [
    hashToken(token),
    usuarioId,
    expires,
    await clientIp(),
    h.get("user-agent")?.slice(0, 300) ?? null,
  ]);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    // COOKIE_SECURE=false só deve ser usado em testes sem HTTPS.
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await query("DELETE FROM sessoes WHERE token_hash = $1", [hashToken(token)]);
  jar.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = await queryOne<{
    id: string;
    nome: string;
    email: string;
    papel: Papel;
    escritorio_id: string;
    escritorio_nome: string;
  }>(
    `SELECT u.id, u.nome, u.email, u.papel, u.escritorio_id, e.nome AS escritorio_nome
       FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id JOIN escritorios e ON e.id = u.escritorio_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND u.ativo`,
    [hashToken(token)],
  );
  if (!row) return null;
  return {
    id: row.id,
    nome: row.nome,
    email: row.email,
    papel: row.papel,
    escritorioId: row.escritorio_id,
    escritorioNome: row.escritorio_nome,
  };
}

/** Para páginas: redireciona ao login quando não autenticado. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
