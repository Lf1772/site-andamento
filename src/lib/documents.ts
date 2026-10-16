import "server-only";
import crypto from "node:crypto";
import { ocrPages } from "./ai/ocr";
import { AiError, emptyUsage, type Usage } from "./ai/client";
import { config } from "./config";
import { query, queryOne } from "./db";
import { countPages, extractPdfPages, isPdf, PdfError, type PageText } from "./pdf";
import { getObject, putObject } from "./storage";

export interface DocumentoRow {
  id: string;
  processo_id: string;
  escritorio_id: string;
  nome_original: string;
  tamanho_bytes: string;
  storage_key: string;
  texto_key: string | null;
  num_paginas: number | null;
  paginas_ocr: number;
  paginas_sem_texto: number;
  status: "pendente" | "extraindo" | "extraido" | "erro";
  erro: string | null;
  created_at: Date;
}

export class UploadError extends Error {}

/** Valida e armazena (criptografado) um PDF enviado. A extração de texto ocorre depois, em segundo plano. */
export async function storeUpload(params: {
  escritorioId: string;
  processoId: string;
  usuarioId: string;
  fileName: string;
  data: Buffer;
}): Promise<DocumentoRow> {
  const { data } = params;
  const nome = params.fileName.replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 200) || "documento.pdf";
  if (data.length === 0) throw new UploadError(`"${nome}": o arquivo está vazio.`);
  if (data.length > config.maxFileBytes) {
    throw new UploadError(`"${nome}": o arquivo excede o limite de ${Math.round(config.maxFileBytes / 1024 / 1024)} MB.`);
  }
  if (!isPdf(data)) throw new UploadError(`"${nome}": o arquivo não é um PDF válido.`);

  let pages: number;
  try {
    pages = await countPages(data);
  } catch (err) {
    throw new UploadError(`"${nome}": ${err instanceof PdfError ? err.message : "não foi possível ler o PDF."}`);
  }
  if (pages > config.maxPagesPerDocument) {
    throw new UploadError(`"${nome}": o documento tem ${pages} páginas; o limite é ${config.maxPagesPerDocument}.`);
  }

  const sha256 = crypto.createHash("sha256").update(data).digest("hex");
  const dup = await queryOne<{ nome_original: string }>("SELECT nome_original FROM documentos WHERE processo_id = $1 AND sha256 = $2", [
    params.processoId,
    sha256,
  ]);
  if (dup) throw new UploadError(`"${nome}": este arquivo já foi enviado neste processo (como "${dup.nome_original}").`);

  const id = crypto.randomUUID();
  const storageKey = `${params.escritorioId}/${params.processoId}/${id}.pdf.enc`;
  await putObject(storageKey, data);
  const row = await queryOne<DocumentoRow>(
    `INSERT INTO documentos (id, processo_id, escritorio_id, enviado_por, nome_original, tamanho_bytes, sha256, storage_key, num_paginas)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [id, params.processoId, params.escritorioId, params.usuarioId, nome, data.length, sha256, storageKey, pages],
  );
  return row!;
}

const running = new Map<string, Promise<Usage>>();

/** Extrai o texto de um documento (com OCR das páginas digitalizadas). Idempotente e sem execuções duplicadas. */
export function ensureExtracted(docId: string, onProgress?: (msg: string) => Promise<void>): Promise<Usage> {
  const existing = running.get(docId);
  if (existing) return existing;
  const p = doExtract(docId, onProgress).finally(() => running.delete(docId));
  running.set(docId, p);
  return p;
}

async function doExtract(docId: string, onProgress?: (msg: string) => Promise<void>): Promise<Usage> {
  const doc = await queryOne<DocumentoRow>("SELECT * FROM documentos WHERE id = $1", [docId]);
  if (!doc || doc.status === "extraido" || doc.status === "erro") return emptyUsage();
  await query("UPDATE documentos SET status = 'extraindo', erro = NULL WHERE id = $1", [docId]);
  let usage = emptyUsage();
  try {
    const pdf = await getObject(doc.storage_key);
    const { pages, scanned } = await extractPdfPages(pdf);
    let ocrCount = 0;
    if (scanned.length > 0) {
      const toOcr = scanned.slice(0, config.maxOcrPagesPerDocument);
      await onProgress?.(`Aplicando OCR em ${toOcr.length} página(s) digitalizada(s) de "${doc.nome_original}"…`);
      const res = await ocrPages(pdf, pages.length, toOcr, (done, total) =>
        onProgress ? onProgress(`OCR de "${doc.nome_original}": ${done}/${total} páginas…`) : Promise.resolve(),
      );
      usage = res.usage;
      for (const p of res.pages) {
        pages[p.n - 1] = p;
        if (p.origem === "ocr") ocrCount++;
      }
    }
    const semTexto = pages.filter((p) => p.origem === "vazio").length;
    if (semTexto === pages.length) {
      throw new PdfError("Nenhum texto legível foi encontrado no documento, nem mesmo por OCR.");
    }
    const textoKey = doc.storage_key.replace(/\.pdf\.enc$/, ".txt.enc");
    await putObject(textoKey, Buffer.from(JSON.stringify({ pages }), "utf8"));
    await query(
      "UPDATE documentos SET status = 'extraido', texto_key = $2, num_paginas = $3, paginas_ocr = $4, paginas_sem_texto = $5 WHERE id = $1",
      [docId, textoKey, pages.length, ocrCount, semTexto],
    );
  } catch (err) {
    const msg =
      err instanceof PdfError || err instanceof AiError
        ? err.message
        : "Falha inesperada ao ler o documento. Tente enviá-lo novamente.";
    if (!(err instanceof PdfError) && !(err instanceof AiError)) console.error(err);
    await query("UPDATE documentos SET status = 'erro', erro = $2 WHERE id = $1", [docId, msg]);
  }
  return usage;
}

export async function loadPages(doc: Pick<DocumentoRow, "texto_key">): Promise<PageText[]> {
  if (!doc.texto_key) return [];
  const raw = await getObject(doc.texto_key);
  return (JSON.parse(raw.toString("utf8")) as { pages: PageText[] }).pages;
}
