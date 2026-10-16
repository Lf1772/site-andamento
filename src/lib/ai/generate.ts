import "server-only";
import { callStructured, type Usage } from "./client";
import { renderCaso, type CasoInput } from "./analyze";
import { FORMALIDADE_INSTRUCAO, SISTEMA_REDACAO, VARIANTE_INSTRUCAO } from "./prompts";
import { AndamentoSchema, type Analise, type CamposRevisao, type Formalidade, type Variante } from "./schemas";

/** Redige (ou reescreve) o andamento a partir dos campos revisados pelo advogado. */
export async function generateAndamento(params: {
  caso: CasoInput;
  campos: CamposRevisao;
  analise: Analise | null;
  variante: Variante;
  formalidade: Formalidade;
  instrucaoAdicional?: string;
  andamentoAtual?: string | null;
}): Promise<{ andamento: string; observacoes: string[]; usage: Usage }> {
  const { analise } = params;
  const contexto = analise
    ? JSON.stringify({
        fase: analise.fase,
        instancia: analise.instancia,
        ultima_movimentacao: analise.ultima_movimentacao,
        decisoes: analise.decisoes,
        recursos: analise.recursos,
        resultados_favoraveis: analise.resultados_favoraveis,
        resultados_desfavoraveis: analise.resultados_desfavoraveis,
        proxima_etapa: analise.proxima_etapa,
        valores: analise.valores,
        prazos: analise.prazos,
        transito_em_julgado: analise.transito_em_julgado,
        novidades_desde_ultimo_andamento: analise.novidades_desde_ultimo_andamento,
        alertas_comunicaveis_ao_cliente: analise.alertas.filter((a) => a.comunicar_ao_cliente),
      })
    : "(sem análise automática)";

  const { data, usage } = await callStructured({
    system: SISTEMA_REDACAO,
    effort: "medium",
    maxTokens: 16000,
    schema: AndamentoSchema,
    content: [
      {
        type: "text",
        text: `${renderCaso(params.caso)}

<campos_revisados_pelo_advogado>
Nome do cliente: ${params.campos.cliente_nome}
Número do processo: ${params.campos.numero_processo || "não informado"}
Fase processual: ${params.campos.fase_processual}
Instância atual: ${params.campos.instancia_atual}
Última movimentação relevante: ${params.campos.ultima_movimentacao}
Resultado favorável: ${params.campos.resultado_favoravel}
Resultado desfavorável: ${params.campos.resultado_desfavoravel}
Próxima etapa: ${params.campos.proxima_etapa}
</campos_revisados_pelo_advogado>

<analise_automatica_contexto>
${contexto}
</analise_automatica_contexto>

${params.andamentoAtual ? `<andamento_atual>\n${params.andamentoAtual}\n</andamento_atual>\n\n` : ""}<instrucoes>
${params.analise?.novidades_desde_ultimo_andamento.length ? "Esta é uma atualização: foque na novidade e em seu impacto, sem repetir todo o histórico.\n" : ""}${VARIANTE_INSTRUCAO[params.variante]}
${FORMALIDADE_INSTRUCAO[params.formalidade]}
${params.instrucaoAdicional?.trim() ? `Pedido adicional do advogado (siga, desde que não viole as regras): ${params.instrucaoAdicional.trim()}` : ""}
</instrucoes>`,
      },
    ],
  });
  return { andamento: data.andamento.trim(), observacoes: data.observacoes_para_revisor, usage };
}
