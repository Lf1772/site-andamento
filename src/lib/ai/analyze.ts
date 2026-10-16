import "server-only";
import type { PageText } from "../pdf";
import { addUsage, AiError, callStructured, emptyUsage, estimateTokens, type Usage } from "./client";
import { SISTEMA_ANALISE, SISTEMA_EXTRACAO_PARCIAL, VARIANTE_INSTRUCAO, FORMALIDADE_INSTRUCAO } from "./prompts";
import { AnaliseSchema, ExtracaoParcialSchema, type Analise, type ExtracaoParcial } from "./schemas";

export interface DocInput {
  ref: string; // D1, D2…
  nome: string;
  enviadoEm: Date;
  novo: boolean;
  pages: PageText[];
}

export interface CasoInput {
  clienteNome: string;
  tratamento: "sr" | "sra" | "neutro";
  posicaoCliente: string;
  numeroProcesso: string | null;
  parteContraria: string | null;
  area: string;
  observacoesInternas: string;
  escritorioNome: string;
  assinatura: string | null;
}

export interface AnteriorInput {
  data: Date;
  resultado: Analise | null;
  andamentoEnviado: string | null;
}

const TRATAMENTO: Record<CasoInput["tratamento"], string> = {
  sr: 'Senhor ("Prezado Sr.")',
  sra: 'Senhora ("Prezada Sra.")',
  neutro: 'Neutro ("Prezado(a) Sr.(a)")',
};

const fmtDate = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

export function renderDoc(doc: DocInput, pages: PageText[] = doc.pages, parte?: string): string {
  const body = pages
    .map((p) => `[Página ${p.n}]${p.origem === "ocr" ? " (texto obtido por OCR)" : ""}\n${p.origem === "vazio" ? "(página sem texto legível)" : p.texto}`)
    .join("\n\n");
  return `<documento id="${doc.ref}" nome="${escapeAttr(doc.nome)}" enviado_em="${fmtDate(doc.enviadoEm)}" novo="${doc.novo ? "sim" : "não"}"${parte ? ` parte="${parte}"` : ""}>\n${body}\n</documento>`;
}

function escapeAttr(s: string) {
  return s.replace(/[<>"&]/g, " ");
}

export function renderCaso(caso: CasoInput): string {
  return `<dados_do_escritorio>
Cliente representado: ${caso.clienteNome}
Tratamento: ${TRATAMENTO[caso.tratamento]}
Posição do cliente informada pelo escritório: ${caso.posicaoCliente}
Número do processo informado: ${caso.numeroProcesso || "não informado"}
Parte contrária informada: ${caso.parteContraria || "não informada"}
Área: ${caso.area}
Nome do escritório (assinatura): ${caso.assinatura?.trim() || caso.escritorioNome}
Data de hoje: ${fmtDate(new Date())}
</dados_do_escritorio>

<observacoes_internas_confidenciais>
${caso.observacoesInternas.trim() || "(nenhuma)"}
</observacoes_internas_confidenciais>`;
}

function renderAnterior(ant: AnteriorInput): string {
  const resumo = ant.resultado
    ? JSON.stringify({ ...ant.resultado, andamento: undefined, campos_revisao: ant.resultado.campos_revisao })
    : "(análise anterior sem dados estruturados)";
  return `<analise_anterior data="${fmtDate(ant.data)}">
${resumo}
</analise_anterior>

<ultimo_andamento_enviado_ao_cliente>
${ant.andamentoEnviado?.trim() || "(não disponível)"}
</ultimo_andamento_enviado_ao_cliente>`;
}

/** Divide os documentos em partes de tamanho limitado, respeitando a ordem e os limites de página. */
export function chunkDocs(docs: DocInput[], maxTokens: number): string[] {
  const chunks: string[] = [];
  for (const doc of docs) {
    let current: PageText[] = [];
    let tokens = 0;
    let part = 1;
    const totalParts: string[] = [];
    const flush = () => {
      if (current.length === 0) return;
      totalParts.push(renderDoc(doc, current, `${part} (páginas ${current[0].n}–${current[current.length - 1].n})`));
      part++;
      current = [];
      tokens = 0;
    };
    for (const p of doc.pages) {
      const t = estimateTokens(p.texto) + 10;
      if (tokens + t > maxTokens && current.length > 0) flush();
      current.push(p);
      tokens += t;
    }
    flush();
    chunks.push(...totalParts);
  }
  // Agrupa partes pequenas consecutivas para reduzir o número de chamadas.
  const merged: string[] = [];
  let buf = "";
  for (const c of chunks) {
    if (buf && estimateTokens(buf + c) > maxTokens) {
      merged.push(buf);
      buf = "";
    }
    buf = buf ? `${buf}\n\n${c}` : c;
  }
  if (buf) merged.push(buf);
  return merged;
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export interface AnalyzeOptions {
  caso: CasoInput;
  docs: DocInput[];
  anterior: AnteriorInput | null;
  singlePassTokenLimit: number;
  maxTokensPerAnalysis: number;
  onProgress: (msg: string) => Promise<void>;
}

/**
 * Análise completa do processo.
 * - Volume pequeno: leitura integral em uma única chamada.
 * - Volume grande: leitura por partes (extração de eventos com citações) e consolidação final.
 * - Atualizações: se o volume total for grande, apenas os documentos novos são lidos integralmente,
 *   e o histórico entra pela análise anterior.
 */
export async function analyzeCase(opts: AnalyzeOptions): Promise<{ analise: Analise; usage: Usage; modo: string }> {
  const { caso, anterior, onProgress } = opts;
  let usage = emptyUsage();

  let docs = opts.docs;
  const totalTokens = docs.reduce((s, d) => s + d.pages.reduce((a, p) => a + estimateTokens(p.texto) + 10, 0), 0);
  let modo = "leitura_integral";

  if (anterior && totalTokens > opts.singlePassTokenLimit) {
    docs = docs.filter((d) => d.novo);
    modo = "atualizacao_documentos_novos";
  }
  const relevantTokens = docs.reduce((s, d) => s + d.pages.reduce((a, p) => a + estimateTokens(p.texto) + 10, 0), 0);
  if (relevantTokens > opts.maxTokensPerAnalysis) {
    throw new AiError(
      `O volume de texto (cerca de ${Math.round(relevantTokens / 1000)} mil tokens) excede o limite configurado por análise (${Math.round(
        opts.maxTokensPerAnalysis / 1000,
      )} mil). Envie apenas os documentos relevantes ou ajuste o limite com o administrador.`,
    );
  }

  let materialProcesso: string;
  if (relevantTokens <= opts.singlePassTokenLimit) {
    materialProcesso = docs.map((d) => renderDoc(d)).join("\n\n");
  } else {
    modo = modo === "atualizacao_documentos_novos" ? "atualizacao_por_partes" : "leitura_por_partes";
    const chunks = chunkDocs(docs, Math.floor(opts.singlePassTokenLimit / 2));
    let done = 0;
    await onProgress(`Processo extenso: lendo ${chunks.length} partes…`);
    const parciais = await mapPool(chunks, 3, async (chunk, i) => {
      const { data, usage: u } = await callStructured({
        system: SISTEMA_EXTRACAO_PARCIAL,
        effort: "medium",
        schema: ExtracaoParcialSchema,
        content: [
          {
            type: "text",
            text: `${renderCaso({ ...caso, observacoesInternas: "" })}\n\nParte ${i + 1} de ${chunks.length} do material do processo:\n\n${chunk}\n\nExtraia os eventos desta parte.`,
          },
        ],
      });
      usage = addUsage(usage, u);
      done++;
      await onProgress(`Lendo partes do processo: ${done}/${chunks.length} concluídas…`);
      return data;
    });
    materialProcesso = renderParciais(parciais, docs);
  }

  await onProgress(anterior ? "Comparando com o histórico e identificando novidades…" : "Analisando cronologia, decisões e fase processual…");

  const instrucoes = [
    anterior
      ? "Esta é uma ATUALIZAÇÃO. Documentos marcados com novo=\"sim\" foram enviados após a última análise. Identifique o que mudou, preencha novidades_desde_ultimo_andamento e redija o andamento focado na novidade."
      : "Esta é a PRIMEIRA análise deste processo. Deixe novidades_desde_ultimo_andamento vazio.",
    modo.includes("partes")
      ? "Atenção: o material foi lido por partes e é apresentado como eventos extraídos com citações. Baseie-se nesses eventos e mantenha as citações indicadas."
      : null,
    modo === "atualizacao_documentos_novos" || modo === "atualizacao_por_partes"
      ? "Atenção: por volume, apenas os documentos novos são apresentados; o histórico anterior está na análise anterior."
      : null,
    `${VARIANTE_INSTRUCAO.padrao} ${FORMALIDADE_INSTRUCAO.padrao}`,
  ]
    .filter(Boolean)
    .join("\n");

  const { data, usage: u } = await callStructured({
    system: SISTEMA_ANALISE,
    effort: "high",
    schema: AnaliseSchema,
    content: [
      { type: "text", text: `<material_do_processo>\n${materialProcesso}\n</material_do_processo>` },
      {
        type: "text",
        text: `${renderCaso(caso)}\n\n${anterior ? renderAnterior(anterior) + "\n\n" : ""}<instrucoes>\n${instrucoes}\n</instrucoes>`,
      },
    ],
  });
  usage = addUsage(usage, u);
  return { analise: data, usage, modo };
}

function renderParciais(parciais: ExtracaoParcial[], docs: DocInput[]): string {
  const lista = docs.map((d) => `${d.ref}: "${d.nome}" (${d.pages.length} páginas, enviado em ${fmtDate(d.enviadoEm)}, novo=${d.novo ? "sim" : "não"})`).join("\n");
  const body = parciais
    .map(
      (p, i) =>
        `<parte numero="${i + 1}">\nPartes e órgãos: ${p.partes_e_orgaos}\nObservações: ${p.observacoes}\nEventos:\n${p.eventos
          .map(
            (e) =>
              `- [${e.data ?? "sem data"}] (${e.tipo}${e.autor ? `, ${e.autor}` : ""}) ${e.descricao} | Fontes: ${e.citacoes
                .map((c) => `${c.documento} p.${c.pagina ?? "?"} "${c.trecho}"`)
                .join("; ")}`,
          )
          .join("\n")}\n</parte>`,
    )
    .join("\n\n");
  return `Documentos:\n${lista}\n\nEventos extraídos (em ordem de leitura):\n${body}`;
}
