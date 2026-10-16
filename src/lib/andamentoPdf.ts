import "server-only";
import { PDFDocument, rgb, StandardFonts, type PDFFont } from "pdf-lib";

/** Converte caracteres fora do conjunto WinAnsi (fontes padrão do PDF) em equivalentes seguros. */
export function toWinAnsi(text: string): string {
  return text
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–]/g, "–")
    .replace(/[—]/g, "—")
    .replace(/…/g, "...")
    .replace(/[  ]/g, " ")
    .replace(/\r/g, "")
    .replace(/[^\n -~¡-ÿ–—•€]/g, "");
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph.trim() === "") {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
      else {
        if (line) lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Gera o PDF contendo exclusivamente o texto destinado ao cliente. */
export async function renderAndamentoPdf(texto: string, titulo: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(toWinAnsi(titulo));
  doc.setProducer("Andamento Processual");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const size = 11.5;
  const lineHeight = 17;
  const margin = 64;
  const [w, h] = [595.28, 841.89];
  const all = wrap(toWinAnsi(texto), font, size, w - margin * 2);
  let page = doc.addPage([w, h]);
  let y = h - margin;
  page.drawRectangle({ x: 0, y: h - 8, width: w, height: 8, color: rgb(0.06, 0.13, 0.27) });
  all.forEach((line, i) => {
    if (y < margin) {
      page = doc.addPage([w, h]);
      y = h - margin;
    }
    const isTitle = i === 0 && line.toLowerCase().startsWith("acompanhamento processual");
    page.drawText(line, { x: margin, y, size: isTitle ? 13 : size, font: isTitle ? bold : font, color: rgb(0.1, 0.12, 0.16) });
    y -= isTitle ? lineHeight + 6 : lineHeight;
  });
  return doc.save();
}
