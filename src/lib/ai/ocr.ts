import "server-only";
import { subsetPdf, type PageText } from "../pdf";
import { addUsage, callStructured, emptyUsage, type Usage } from "./client";
import { SISTEMA_OCR } from "./prompts";
import { TranscricaoSchema } from "./schemas";

const MAX_PAGES_PER_BATCH = 15;
const MAX_BATCH_BYTES = 18 * 1024 * 1024;

/**
 * OCR de páginas digitalizadas: as páginas sem camada de texto são enviadas ao modelo
 * (que lê PDFs visualmente) em lotes, e a transcrição volta mapeada à página original.
 */
export async function ocrPages(
  pdf: Buffer,
  totalPages: number,
  pageNumbers: number[],
  onProgress?: (done: number, total: number) => Promise<void>,
): Promise<{ pages: PageText[]; usage: Usage }> {
  const avgPageBytes = pdf.length / Math.max(totalPages, 1);
  const perBatch = Math.max(1, Math.min(MAX_PAGES_PER_BATCH, Math.floor(MAX_BATCH_BYTES / Math.max(avgPageBytes, 1))));
  const batches: number[][] = [];
  for (let i = 0; i < pageNumbers.length; i += perBatch) batches.push(pageNumbers.slice(i, i + perBatch));

  let usage = emptyUsage();
  const out: PageText[] = [];
  let done = 0;
  for (const batch of batches) {
    const sub = await subsetPdf(pdf, batch);
    const { data, usage: u } = await callStructured({
      system: SISTEMA_OCR,
      effort: "low",
      maxTokens: 32000,
      schema: TranscricaoSchema,
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: sub.toString("base64") } },
        {
          type: "text",
          text: `Transcreva as ${batch.length} página(s) deste PDF. Use "pagina" de 1 a ${batch.length}, na ordem do arquivo.`,
        },
      ],
    });
    usage = addUsage(usage, u);
    for (const p of data.paginas) {
      const original = batch[p.pagina - 1];
      if (!original) continue;
      out.push({ n: original, texto: p.legivel ? p.texto.trim() : "", origem: p.legivel && p.texto.trim() ? "ocr" : "vazio" });
    }
    done += batch.length;
    await onProgress?.(done, pageNumbers.length);
  }
  return { pages: out, usage };
}
