import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser, type SessionUser } from "./auth";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/** Bloqueia requisições de outras origens (proteção adicional contra CSRF). */
function assertSameOrigin(req: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (!origin || !host) throw new HttpError(403, "Origem da requisição não permitida.");
  try {
    if (new URL(origin).host !== host) throw new Error();
  } catch {
    throw new HttpError(403, "Origem da requisição não permitida.");
  }
}

type Handler<C> = (req: Request, ctx: C & { user: SessionUser }) => Promise<Response>;

/** Envolve um handler de API exigindo autenticação e tratando erros de forma padronizada. */
export function withUser<C extends object>(handler: Handler<C>, opts: { permission?: (u: SessionUser) => boolean } = {}) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      assertSameOrigin(req);
      const user = await getCurrentUser();
      if (!user) throw new HttpError(401, "Sessão expirada. Faça login novamente.");
      if (opts.permission && !opts.permission(user)) throw new HttpError(403, "Você não tem permissão para esta ação.");
      return await handler(req, { ...ctx, user });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown) {
  if (err instanceof HttpError) return json({ erro: err.message }, err.status);
  console.error(err);
  return json({ erro: "Erro interno. Tente novamente em instantes." }, 500);
}

export function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
