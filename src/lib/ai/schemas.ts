import { z } from "zod/v4";

/** Referência à fonte documental de uma informação. */
export const Citacao = z.object({
  documento: z.string().describe("Identificador do documento, por exemplo D1, D2"),
  pagina: z.number().nullable().describe("Número inteiro da página dentro do documento; null se não for possível indicar"),
  trecho: z.string().describe("Trecho literal curto (até ~200 caracteres) que fundamenta a informação"),
});
export type Citacao = z.infer<typeof Citacao>;

export const Natureza = z.enum(["fato_documentado", "interpretacao", "previsao"]);

export const ItemFundamentado = z.object({
  texto: z.string(),
  natureza: Natureza,
  citacoes: z.array(Citacao),
});
export type ItemFundamentado = z.infer<typeof ItemFundamentado>;

export const FASES = [
  "conhecimento",
  "recursal",
  "liquidacao",
  "execucao",
  "cumprimento_de_sentenca",
  "acordo_homologado",
  "arquivado",
  "suspenso",
  "outra",
  "indeterminada",
] as const;

export const INSTANCIAS = ["primeira_instancia", "segunda_instancia", "tribunal_superior", "indeterminada"] as const;

export const AnaliseSchema = z.object({
  cliente: z.object({
    nome: z.string(),
    posicao: z.string().describe("Posição processual atual do cliente (ex.: reclamante, reclamado, recorrente, recorrido, exequente, executado)"),
    posicao_confirmada_nos_documentos: z.boolean(),
    citacoes: z.array(Citacao),
  }),
  numero_processo: z.object({ valor: z.string().nullable(), citacoes: z.array(Citacao) }),
  orgao: z.object({
    justica: z.string().nullable(),
    tribunal: z.string().nullable(),
    vara: z.string().nullable(),
    citacoes: z.array(Citacao),
  }),
  fase: z.object({
    valor: z.enum(FASES),
    descricao: z.string(),
    determinavel: z.boolean(),
    citacoes: z.array(Citacao),
  }),
  instancia: z.object({
    valor: z.enum(INSTANCIAS),
    orgao_atual: z.string().nullable(),
    justificativa: z.string(),
    citacoes: z.array(Citacao),
  }),
  ultima_movimentacao: z.object({
    data: z.string().nullable().describe("Data no formato DD/MM/AAAA, se constar"),
    descricao: z.string(),
    e_decisao_de_merito: z.boolean(),
    citacoes: z.array(Citacao),
  }),
  cronologia: z.array(
    z.object({
      data: z.string().nullable(),
      evento: z.string(),
      tipo: z.enum(["peticao", "decisao", "recurso", "audiencia", "calculo", "pagamento_ou_deposito", "prazo_ou_intimacao", "movimentacao_administrativa", "outro"]),
      citacoes: z.array(Citacao),
    }),
  ),
  decisoes: z.array(
    z.object({
      data: z.string().nullable(),
      orgao: z.string().nullable(),
      tipo: z.enum(["sentenca", "acordao", "decisao_monocratica", "decisao_interlocutoria", "homologacao", "despacho", "outro"]),
      status: z.enum(["proferida_sujeita_a_recurso", "definitiva_com_transito_documentado", "modificada_por_decisao_posterior", "status_incerto"]),
      resumo: z.string(),
      citacoes: z.array(Citacao),
    }),
  ),
  resultados_favoraveis: z.array(ItemFundamentado),
  resultados_desfavoraveis: z.array(ItemFundamentado),
  recursos: z.array(
    z.object({
      tipo: z.string(),
      interposto_por: z.string(),
      interposto_pelo_cliente: z.boolean().nullable(),
      data: z.string().nullable(),
      objetivo: z.string(),
      situacao: z.enum(["aguardando_julgamento", "julgado", "situacao_incerta"]),
      resultado: z.string().nullable(),
      alteracoes_na_decisao_anterior: z.string().nullable(),
      citacoes: z.array(Citacao),
    }),
  ),
  providencias_pendentes: z.array(ItemFundamentado),
  proxima_etapa: z.object({ texto: z.string(), e_apenas_possibilidade: z.boolean(), citacoes: z.array(Citacao) }),
  valores: z.array(
    z.object({
      descricao: z.string(),
      valor: z.string(),
      situacao: z.enum(["reconhecido_sem_valor_definido", "calculado", "homologado", "depositado", "pago", "acordo", "outro"]),
      citacoes: z.array(Citacao),
    }),
  ),
  prazos: z.array(
    z.object({
      descricao: z.string(),
      data_limite: z.string().nullable(),
      responsavel: z.string().nullable(),
      confirmado_nos_documentos: z.boolean(),
      citacoes: z.array(Citacao),
    }),
  ),
  transito_em_julgado: z.object({ documentado: z.boolean(), citacoes: z.array(Citacao) }),
  alertas: z.array(
    z.object({
      gravidade: z.enum(["alta", "media", "baixa"]),
      mensagem: z.string(),
      comunicar_ao_cliente: z.boolean(),
    }),
  ),
  novidades_desde_ultimo_andamento: z.array(ItemFundamentado).describe("Somente em atualizações: o que mudou desde a análise anterior. Lista vazia em análises iniciais."),
  campos_revisao: z.object({
    fase_processual: z.string(),
    instancia_atual: z.string(),
    ultima_movimentacao: z.string(),
    resultado_favoravel: z.string(),
    resultado_desfavoravel: z.string(),
    proxima_etapa: z.string(),
  }),
  andamento: z.string().describe("Texto final destinado ao cliente"),
});
export type Analise = z.infer<typeof AnaliseSchema>;

/** Campos editáveis na tela de revisão. */
export const CamposRevisaoSchema = z.object({
  cliente_nome: z.string().max(300),
  numero_processo: z.string().max(100),
  fase_processual: z.string().max(2000),
  instancia_atual: z.string().max(2000),
  ultima_movimentacao: z.string().max(4000),
  resultado_favoravel: z.string().max(6000),
  resultado_desfavoravel: z.string().max(6000),
  proxima_etapa: z.string().max(4000),
});
export type CamposRevisao = z.infer<typeof CamposRevisaoSchema>;

/** Resultado da leitura de uma parte de um processo extenso (etapa "map"). */
export const ExtracaoParcialSchema = z.object({
  eventos: z.array(
    z.object({
      data: z.string().nullable(),
      descricao: z.string().describe("Descrição objetiva e completa do ato, incluindo dispositivo de decisões, pedidos deferidos e indeferidos, valores e prazos"),
      tipo: z.enum(["peticao", "decisao", "recurso", "audiencia", "calculo", "pagamento_ou_deposito", "prazo_ou_intimacao", "movimentacao_administrativa", "outro"]),
      autor: z.string().nullable().describe("Quem praticou o ato (juízo, tribunal, reclamante, reclamada etc.)"),
      citacoes: z.array(Citacao),
    }),
  ),
  partes_e_orgaos: z.string().describe("Partes, advogados, vara/tribunal e número do processo mencionados nesta parte"),
  observacoes: z.string().describe("Contradições, lacunas ou páginas ilegíveis percebidas nesta parte"),
});
export type ExtracaoParcial = z.infer<typeof ExtracaoParcialSchema>;

export const TranscricaoSchema = z.object({
  paginas: z.array(z.object({ pagina: z.number().int(), texto: z.string(), legivel: z.boolean() })),
});

export const AndamentoSchema = z.object({
  andamento: z.string(),
  observacoes_para_revisor: z.array(z.string()),
});

export const VARIANTES = {
  padrao: "Andamento padrão",
  resumido: "Andamento resumido",
  detalhado: "Andamento detalhado",
  simples: "Linguagem ainda mais simples",
} as const;
export type Variante = keyof typeof VARIANTES;

export const FORMALIDADES = {
  padrao: "Formalidade padrão",
  mais_formal: "Mais formal",
  menos_formal: "Mais próximo e cordial",
} as const;
export type Formalidade = keyof typeof FORMALIDADES;
