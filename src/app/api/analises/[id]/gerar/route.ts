import { z } from "zod/v4";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/auth";
import { AiError, estimateTokens } from "@/lib/ai/client";
import { generateAndamento } from "@/lib/ai/generate";
import { CamposRevisaoSchema, FORMALIDADES, VARIANTES, type Formalidade, type Variante } from "@/lib/ai/schemas";
import { query, queryOne } from "@/lib/db";
import { HttpError, isUuid, json, withUser } from "@/lib/http";
import { getAnaliseForUser, type ProcessoRow } from "@/lib/processos";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  campos: CamposRevisaoSchema,
  variante: z.enum(Object.keys(VARIANTES) as [Variante, ...Variante[]]),
  formalidade: z.enum(Object.keys(FORMALIDADES) as [Formalidade, ...Formalidade[]]),
  instrucao: z.string().max(1000).optional().default(""),
});

/** Gera um novo texto do andamento a partir dos campos revisados. */
export const POST = withUser<Ctx>(async (req, ctx) => {
  const { id } = await ctx.params;
  if (!isUuid(id)) throw new HttpError(404, "Análise não encontrada.");
  const a = await getAnaliseForUser(ctx.user, id);
  if (a.status !== "concluida") throw new HttpError(400, "A análise ainda não foi concluída.");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Dados inválidos.");
  const { campos, variante, formalidade, instrucao } = parsed.data;

  const p = (await queryOne<ProcessoRow>("SELECT * FROM processos WHERE id = $1", [a.processo_id]))!;
  const esc = (await queryOne<{ nome: string; assinatura: string | null }>("SELECT nome, assinatura FROM escritorios WHERE id = $1", [p.escritorio_id]))!;

  try {
    const r = await generateAndamento({
      caso: {
        clienteNome: campos.cliente_nome || p.cliente_nome,
        tratamento: p.tratamento,
        posicaoCliente: p.posicao_cliente,
        numeroProcesso: campos.numero_processo || p.numero_processo,
        parteContraria: p.parte_contraria,
        area: p.area,
        observacoesInternas: p.observacoes_internas,
        escritorioNome: esc.nome,
        assinatura: esc.assinatura,
      },
      campos,
      analise: a.resultado,
      variante,
      formalidade,
      instrucaoAdicional: instrucao,
      andamentoAtual: instrucao ? a.andamento : null,
    });
    await query(
      `UPDATE analises SET campos = $2, andamento = $3, variante = $4, formalidade = $5, aprovado_por = NULL, aprovado_em = NULL,
              tokens_entrada = tokens_entrada + $6, tokens_saida = tokens_saida + $7, custo_estimado_usd = custo_estimado_usd + $8, updated_at = now()
        WHERE id = $1`,
      [a.id, JSON.stringify(campos), r.andamento, variante, formalidade, r.usage.inputTokens, r.usage.outputTokens, r.usage.costUsd],
    );
    await query("INSERT INTO andamento_versoes (analise_id, texto, variante, origem, criado_por) VALUES ($1,$2,$3,'ia',$4)", [
      a.id,
      r.andamento,
      variante,
      ctx.user.id,
    ]);
    await audit({
      escritorioId: ctx.user.escritorioId,
      usuarioId: ctx.user.id,
      acao: "andamento_regenerado",
      entidade: "analise",
      entidadeId: a.id,
      detalhes: { variante, formalidade, instrucao: instrucao ? estimateTokens(instrucao) : 0 },
      ip: await clientIp(),
    });
    return json({ andamento: r.andamento, observacoes: r.observacoes });
  } catch (err) {
    if (err instanceof AiError) throw new HttpError(502, err.message);
    throw err;
  }
});
