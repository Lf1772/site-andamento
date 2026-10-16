import { after } from "next/server";
import { audit } from "@/lib/audit";
import { can, clientIp } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { ensureExtracted, type DocumentoRow } from "@/lib/documents";
import { HttpError, isUuid, json, withUser } from "@/lib/http";
import { deleteObject, getObject } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string; docId: string }> };

async function load(ctx: Ctx & { user: { escritorioId: string } }) {
  const { id, docId } = await ctx.params;
  if (!isUuid(id) || !isUuid(docId)) throw new HttpError(404, "Documento não encontrado.");
  const doc = await queryOne<DocumentoRow>("SELECT * FROM documentos WHERE id = $1 AND processo_id = $2 AND escritorio_id = $3", [
    docId,
    id,
    ctx.user.escritorioId,
  ]);
  if (!doc) throw new HttpError(404, "Documento não encontrado.");
  return doc;
}

/** Download autenticado do PDF original (nunca há link público). */
export const GET = withUser<Ctx>(async (_req, ctx) => {
  const doc = await load(ctx);
  const data = await getObject(doc.storage_key);
  await audit({ escritorioId: ctx.user.escritorioId, usuarioId: ctx.user.id, acao: "documento_baixado", entidade: "documento", entidadeId: doc.id, ip: await clientIp() });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(doc.nome_original)}`,
      "Cache-Control": "private, no-store",
    },
  });
});

/** Reprocessa a leitura de um documento que falhou. */
export const POST = withUser<Ctx>(async (_req, ctx) => {
  const doc = await load(ctx);
  if (doc.status !== "erro") throw new HttpError(400, "O documento não está com erro.");
  await query("UPDATE documentos SET status = 'pendente', erro = NULL WHERE id = $1", [doc.id]);
  after(() => ensureExtracted(doc.id).then(() => undefined));
  return json({ ok: true });
});

export const DELETE = withUser<Ctx>(
  async (_req, ctx) => {
    const doc = await load(ctx);
    await query("DELETE FROM documentos WHERE id = $1", [doc.id]);
    await deleteObject(doc.storage_key);
    if (doc.texto_key) await deleteObject(doc.texto_key);
    await audit({
      escritorioId: ctx.user.escritorioId,
      usuarioId: ctx.user.id,
      acao: "documento_excluido",
      entidade: "documento",
      entidadeId: doc.id,
      detalhes: { nome: doc.nome_original, processo: doc.processo_id },
      ip: await clientIp(),
    });
    return json({ ok: true });
  },
  { permission: can.excluirDocumento },
);
