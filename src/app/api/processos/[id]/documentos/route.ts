import { after } from "next/server";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/auth";
import { ensureExtracted, storeUpload, UploadError } from "@/lib/documents";
import { HttpError, isUuid, json, withUser } from "@/lib/http";
import { getProcessoForUser } from "@/lib/processos";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withUser<Ctx>(async (req, ctx) => {
  const { id } = await ctx.params;
  if (!isUuid(id)) throw new HttpError(404, "Processo não encontrado.");
  const p = await getProcessoForUser(ctx.user, id);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "Não foi possível receber os arquivos. Verifique o tamanho e tente novamente.");
  }
  const files = form.getAll("arquivos").filter((f): f is File => f instanceof File);
  if (files.length === 0) throw new HttpError(400, "Selecione ao menos um arquivo PDF.");
  if (files.length > 50) throw new HttpError(400, "Envie no máximo 50 arquivos por vez.");

  const enviados: { id: string; nome: string; paginas: number | null }[] = [];
  const erros: string[] = [];
  for (const file of files) {
    try {
      const doc = await storeUpload({
        escritorioId: ctx.user.escritorioId,
        processoId: p.id,
        usuarioId: ctx.user.id,
        fileName: file.name,
        data: Buffer.from(await file.arrayBuffer()),
      });
      enviados.push({ id: doc.id, nome: doc.nome_original, paginas: doc.num_paginas });
    } catch (err) {
      if (err instanceof UploadError) erros.push(err.message);
      else {
        console.error(err);
        erros.push(`"${file.name}": falha ao salvar o arquivo.`);
      }
    }
  }
  if (enviados.length > 0) {
    await audit({
      escritorioId: ctx.user.escritorioId,
      usuarioId: ctx.user.id,
      acao: "documentos_enviados",
      entidade: "processo",
      entidadeId: p.id,
      detalhes: { documentos: enviados.map((d) => d.id) },
      ip: await clientIp(),
    });
    // Inicia a leitura dos PDFs em segundo plano para detectar problemas cedo.
    after(async () => {
      for (const d of enviados) await ensureExtracted(d.id);
    });
  }
  return json({ enviados, erros }, enviados.length ? 201 : 400);
});
