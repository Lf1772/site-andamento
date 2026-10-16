import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";

process.env.STORAGE_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");

test("criptografia de armazenamento: ida e volta e detecção de adulteração", async () => {
  const { encrypt, decrypt } = await import("../src/lib/storage");
  const data = Buffer.from("Processo 0001234-56.2024.5.02.0001 — dados sigilosos");
  const enc = encrypt(data);
  assert.notDeepEqual(enc.subarray(28), data);
  assert.deepEqual(decrypt(enc), data);
  enc[enc.length - 1] ^= 1;
  assert.throws(() => decrypt(enc));
});

test("divisão de processos extensos preserva ordem e limites de página", async () => {
  const { chunkDocs } = await import("../src/lib/ai/analyze");
  const pages = Array.from({ length: 50 }, (_, i) => ({ n: i + 1, texto: "x".repeat(3200), origem: "texto" as const }));
  const chunks = chunkDocs([{ ref: "D1", nome: "autos.pdf", enviadoEm: new Date(), novo: true, pages }], 10_000);
  assert.ok(chunks.length > 1);
  const all = chunks.join("\n");
  const order = [...all.matchAll(/\[Página (\d+)\]/g)].map((m) => Number(m[1]));
  assert.deepEqual(order, pages.map((p) => p.n));
});

test("PDF do andamento aceita acentuação do português", async () => {
  const { toWinAnsi, renderAndamentoPdf } = await import("../src/lib/andamentoPdf");
  assert.equal(toWinAnsi("Ação – “decisão” …"), 'Ação – "decisão" ...');
  const pdf = await renderAndamentoPdf("Acompanhamento processual – José\n\nPrezado Sr. José, informamos a decisão.", "Teste");
  assert.equal(Buffer.from(pdf.subarray(0, 5)).toString(), "%PDF-");
});

test("schema de análise aceita resultado mínimo válido", async () => {
  const { AnaliseSchema } = await import("../src/lib/ai/schemas");
  const c: never[] = [];
  const ok = AnaliseSchema.safeParse({
    cliente: { nome: "A", posicao: "reclamante", posicao_confirmada_nos_documentos: true, citacoes: c },
    numero_processo: { valor: null, citacoes: c },
    orgao: { justica: null, tribunal: null, vara: null, citacoes: c },
    fase: { valor: "indeterminada", descricao: "", determinavel: false, citacoes: c },
    instancia: { valor: "indeterminada", orgao_atual: null, justificativa: "", citacoes: c },
    ultima_movimentacao: { data: null, descricao: "", e_decisao_de_merito: false, citacoes: c },
    cronologia: c, decisoes: c, resultados_favoraveis: c, resultados_desfavoraveis: c, recursos: c, providencias_pendentes: c,
    proxima_etapa: { texto: "", e_apenas_possibilidade: true, citacoes: c },
    valores: c, prazos: c, transito_em_julgado: { documentado: false, citacoes: c }, alertas: c, novidades_desde_ultimo_andamento: c,
    campos_revisao: { fase_processual: "", instancia_atual: "", ultima_movimentacao: "", resultado_favoravel: "", resultado_desfavoravel: "", proxima_etapa: "" },
    andamento: "texto",
  });
  assert.ok(ok.success);
});
