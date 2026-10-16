import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/auth";
import { renderAndamentoPdf } from "@/lib/andamentoPdf";
import { HttpError, isUuid, withUser } from "@/lib/http";
import { getAnaliseForUser } from "@/lib/processos";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withUser<Ctx>(async (_req, ctx) => {
  const { id } = await ctx.params;
  if (!isUuid(id)) throw new HttpError(404, "Análise não encontrada.");
  const a = await getAnaliseForUser(ctx.user, id);
  if (!a.andamento) throw new HttpError(400, "Não há andamento gerado.");
  if (!a.aprovado_em) throw new HttpError(403, "O andamento precisa ser revisado e aprovado antes do download.");
  const nome = a.campos?.cliente_nome || "cliente";
  const pdf = await renderAndamentoPdf(a.andamento, `Acompanhamento processual - ${nome}`);
  await audit({ escritorioId: ctx.user.escritorioId, usuarioId: ctx.user.id, acao: "andamento_pdf_baixado", entidade: "analise", entidadeId: a.id, ip: await clientIp() });
  const fileName = `andamento-${nome.normalize("NFD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase()}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
