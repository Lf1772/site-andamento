import { audit } from "@/lib/audit";
import { clientIp, destroySession } from "@/lib/auth";
import { json, withUser } from "@/lib/http";

export const POST = withUser(async (_req, { user }) => {
  await destroySession();
  await audit({ escritorioId: user.escritorioId, usuarioId: user.id, acao: "logout", ip: await clientIp() });
  return json({ ok: true });
});
