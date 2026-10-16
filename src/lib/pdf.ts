import "server-only";
import { PDFDocument } from "pdf-lib";
import { extractText, getDocumentProxy } from "unpdf";

export interface PageText {
  n: number;
  texto: string;
  origem: "texto" | "ocr" | "vazio";
}

export class PdfError extends Error {}

/** Páginas com menos caracteres úteis que isso são tratadas como digitalizadas (candidatas a OCR). */
const MIN_CHARS_TEXT_PAGE = 40;

function normalize(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isPdf(buf: Buffer): boolean {
  return buf.subarray(0, 1024).includes(Buffer.from("%PDF-"));
}

/** Extrai o texto de cada página de um PDF digital. */
export async function extractPdfPages(buf: Buffer): Promise<{ pages: PageText[]; scanned: number[] }> {
  let pdf;
  try {
    pdf = await getDocumentProxy(new Uint8Array(buf));
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === "PasswordException") throw new PdfError("O PDF está protegido por senha. Remova a proteção e envie novamente.");
    throw new PdfError("Não foi possível ler o PDF. O arquivo pode estar corrompido ou não ser um PDF válido.");
  }
  try {
    const { text } = await extractText(pdf, { mergePages: false });
    const pages: PageText[] = [];
    const scanned: number[] = [];
    text.forEach((raw, i) => {
      const texto = normalize(raw ?? "");
      const useful = texto.replace(/\s/g, "").length;
      if (useful < MIN_CHARS_TEXT_PAGE) {
        scanned.push(i + 1);
        pages.push({ n: i + 1, texto, origem: "vazio" });
      } else {
        pages.push({ n: i + 1, texto, origem: "texto" });
      }
    });
    return { pages, scanned };
  } finally {
    await pdf.loadingTask.destroy().catch(() => {});
  }
}

export async function countPages(buf: Buffer): Promise<number> {
  try {
    const doc = await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false });
    return doc.getPageCount();
  } catch {
    const pdf = await getDocumentProxy(new Uint8Array(buf)).catch(() => null);
    if (!pdf) throw new PdfError("Não foi possível ler o PDF. O arquivo pode estar corrompido.");
    const n = pdf.numPages;
    await pdf.loadingTask.destroy().catch(() => {});
    return n;
  }
}

/** Gera um PDF contendo apenas as páginas indicadas (numeração a partir de 1). */
export async function subsetPdf(buf: Buffer, pageNumbers: number[]): Promise<Buffer> {
  const src = await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false });
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, pageNumbers.map((n) => n - 1));
  copied.forEach((p) => out.addPage(p));
  return Buffer.from(await out.save());
}
