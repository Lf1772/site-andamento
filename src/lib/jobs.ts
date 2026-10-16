import "server-only";
import { analyzeCase, type AnteriorInput, type CasoInput, type DocInput } from "./ai/analyze";
import { addUsage, AiError, emptyUsage } from "./ai/client";
import { config } from "./config";
import { query, queryOne } from "./db";
import { ensureExtracted, loadPages, type DocumentoRow } from "./documents";
import type { AnaliseRow, ProcessoRow } from "./processos";

async function setStatus(id: string, status: AnaliseRow["status"], progresso: string | null) {
  await query("UPDATE analises SET status = $2, progresso = $3, updated_at = now() WHERE id = $1", [id, status, progresso]);
}

/** Executa a análise em segundo plano: extração de texto/OCR → análise por IA → rascunho do andamento. */
export async function runAnalysis(analiseId: string): Promise<void> {
  let usage = emptyUsage();
  try {
    const analise = await queryOne<AnaliseRow>("SELECT * FROM analises WHERE id = $1", [analiseId]);
    if (!analise || analise.status !== "na_fila") return;
    const processo = (await queryOne<ProcessoRow>("SELECT * FROM processos WHERE id = $1", [analise.processo_id]))!;
    const escritorio = (await queryOne<{ nome: string; assinatura: string | null }>("SELECT nome, assinatura FROM escritorios WHERE id = $1", [
      processo.escritorio_id,
    ]))!;

    const docs = await query<DocumentoRow & { novo: boolean }>(
      `SELECT d.*, ad.novo FROM analise_documentos ad JOIN documentos d ON d.id = ad.documento_id
        WHERE ad.analise_id = $1 ORDER BY d.created_at, d.nome_original`,
      [analiseId],
    );

    // 1. Extração de texto e OCR
    await setStatus(analiseId, "extraindo", "Lendo os arquivos PDF…");
    for (const [i, d] of docs.entries()) {
      await setStatus(analiseId, "extraindo", `Extraindo texto de "${d.nome_original}" (${i + 1}/${docs.length})…`);
      const u = await ensureExtracted(d.id, (msg) => setStatus(analiseId, "extraindo", msg));
      usage = addUsage(usage, u);
    }
    const fresh = await query<DocumentoRow>("SELECT * FROM documentos WHERE id = ANY($1::uuid[])", [docs.map((d) => d.id)]);
    const byId = new Map(fresh.map((d) => [d.id, d]));
    const ok = docs.filter((d) => byId.get(d.id)?.status === "extraido");
    const failed = docs.filter((d) => byId.get(d.id)?.status !== "extraido");
    if (ok.length === 0) {
      throw new AiError(
        "Nenhum documento pôde ser lido. " + failed.map((d) => `"${d.nome_original}": ${byId.get(d.id)?.erro ?? "erro desconhecido"}`).join(" "),
      );
    }

    const docInputs: DocInput[] = [];
    const refs: Record<string, string> = {};
    for (const [i, d] of ok.entries()) {
      const ref = `D${i + 1}`;
      refs[ref] = d.id;
      docInputs.push({ ref, nome: d.nome_original, enviadoEm: d.created_at, novo: d.novo, pages: await loadPages(byId.get(d.id)!) });
    }

    let anterior: AnteriorInput | null = null;
    if (analise.analise_anterior_id) {
      const prev = await queryOne<AnaliseRow>("SELECT * FROM analises WHERE id = $1", [analise.analise_anterior_id]);
      if (prev) anterior = { data: prev.created_at, resultado: prev.resultado, andamentoEnviado: prev.andamento };
    }

    const caso: CasoInput = {
      clienteNome: processo.cliente_nome,
      tratamento: processo.tratamento,
      posicaoCliente: processo.posicao_cliente,
      numeroProcesso: processo.numero_processo,
      parteContraria: processo.parte_contraria,
      area: processo.area,
      observacoesInternas: processo.observacoes_internas,
      escritorioNome: escritorio.nome,
      assinatura: escritorio.assinatura,
    };

    // 2. Análise por IA
    await setStatus(analiseId, "analisando", "Analisando os documentos com inteligência artificial…");
    const result = await analyzeCase({
      caso,
      docs: docInputs,
      anterior,
      singlePassTokenLimit: config.singlePassTokenLimit,
      maxTokensPerAnalysis: config.maxTokensPerAnalysis,
      onProgress: (msg) => setStatus(analiseId, "analisando", msg),
    });
    usage = addUsage(usage, result.usage);
    const a = result.analise;

    if (failed.length > 0) {
      a.alertas.unshift({
        gravidade: "alta",
        mensagem: `Documento(s) não lido(s) e fora da análise: ${failed.map((d) => `"${d.nome_original}" (${byId.get(d.id)?.erro ?? "erro"})`).join("; ")}.`,
        comunicar_ao_cliente: false,
      });
    }
    const semTexto = ok.filter((d) => (byId.get(d.id)?.paginas_sem_texto ?? 0) > 0);
    if (semTexto.length > 0) {
      a.alertas.push({
        gravidade: "media",
        mensagem: `Há páginas sem texto legível (mesmo após OCR) em: ${semTexto
          .map((d) => `"${d.nome_original}" (${byId.get(d.id)!.paginas_sem_texto} pág.)`)
          .join("; ")}. Confira manualmente se contêm informações relevantes.`,
        comunicar_ao_cliente: false,
      });
    }

    const campos = {
      cliente_nome: processo.cliente_nome,
      numero_processo: processo.numero_processo || a.numero_processo.valor || "",
      ...a.campos_revisao,
    };
    const resultado = { ...a, _meta: { modo: result.modo, documentos: refs } };

    await query(
      `UPDATE analises SET status = 'concluida', progresso = NULL, resultado = $2, campos = $3, andamento = $4,
              modelo = $5, tokens_entrada = $6, tokens_saida = $7, custo_estimado_usd = $8, updated_at = now()
        WHERE id = $1`,
      [analiseId, JSON.stringify(resultado), JSON.stringify(campos), a.andamento, usage.model, usage.inputTokens, usage.outputTokens, usage.costUsd],
    );
    await query("INSERT INTO andamento_versoes (analise_id, texto, variante, origem, criado_por) VALUES ($1,$2,'padrao','ia',$3)", [
      analiseId,
      a.andamento,
      analise.solicitado_por,
    ]);
    if (!processo.numero_processo && a.numero_processo.valor) {
      await query("UPDATE processos SET numero_processo = $2 WHERE id = $1", [processo.id, a.numero_processo.valor.slice(0, 100)]);
    }
    await query("UPDATE processos SET ultima_analise_em = now(), updated_at = now() WHERE id = $1", [processo.id]);
  } catch (err) {
    const msg = err instanceof AiError ? err.message : "Falha inesperada durante a análise. Tente novamente.";
    if (!(err instanceof AiError)) console.error("Erro na análise", analiseId, err);
    await query(
      "UPDATE analises SET status = 'erro', erro = $2, progresso = NULL, tokens_entrada = $3, tokens_saida = $4, custo_estimado_usd = $5, updated_at = now() WHERE id = $1",
      [analiseId, msg, usage.inputTokens, usage.outputTokens, usage.costUsd],
    );
  }
}
