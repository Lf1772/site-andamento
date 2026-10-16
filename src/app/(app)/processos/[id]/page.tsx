import Link from "next/link";
import { AnalysisProgress } from "@/components/AnalysisProgress";
import { AnaliseStatusBadge, ConfidentialNotice, EmptyState, formatDate } from "@/components/ui";
import { can, requireUser } from "@/lib/auth";
import { config } from "@/lib/config";
import { query } from "@/lib/db";
import { isUuid } from "@/lib/http";
import { AREAS, failStaleAnalyses, getProcessoForUser, POSICOES } from "@/lib/processos";
import { notFound } from "next/navigation";
import { DadosProcesso, DocumentosPanel, ExcluirProcesso, ObservacoesInternas } from "./ProcessoClient";

export const metadata = { title: "Processo" };

export default async function ProcessoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const p = await getProcessoForUser(user, id).catch(() => null);
  if (!p) notFound();
  await failStaleAnalyses();

  const docs = await query<{
    id: string;
    nome_original: string;
    tamanho_bytes: string;
    num_paginas: number | null;
    paginas_ocr: number;
    paginas_sem_texto: number;
    status: string;
    erro: string | null;
    created_at: Date;
    enviado_por_nome: string | null;
    analisado: boolean;
  }>(
    `SELECT d.id, d.nome_original, d.tamanho_bytes, d.num_paginas, d.paginas_ocr, d.paginas_sem_texto, d.status, d.erro, d.created_at,
            u.nome AS enviado_por_nome,
            EXISTS (SELECT 1 FROM analise_documentos ad JOIN analises a ON a.id = ad.analise_id WHERE ad.documento_id = d.id AND a.status = 'concluida') AS analisado
       FROM documentos d LEFT JOIN usuarios u ON u.id = d.enviado_por WHERE d.processo_id = $1 ORDER BY d.created_at`,
    [p.id],
  );
  const analises = await query<{
    id: string;
    tipo: string;
    status: string;
    erro: string | null;
    andamento: string | null;
    aprovado_em: Date | null;
    salvo_no_historico: boolean;
    created_at: Date;
    solicitante: string | null;
    aprovador: string | null;
    custo_estimado_usd: string;
  }>(
    `SELECT a.id, a.tipo, a.status, a.erro, a.andamento, a.aprovado_em, a.salvo_no_historico, a.created_at, a.custo_estimado_usd,
            s.nome AS solicitante, ap.nome AS aprovador
       FROM analises a LEFT JOIN usuarios s ON s.id = a.solicitado_por LEFT JOIN usuarios ap ON ap.id = a.aprovado_por
      WHERE a.processo_id = $1 ORDER BY a.created_at DESC`,
    [p.id],
  );
  const running = analises.find((a) => ["na_fila", "extraindo", "analisando", "redigindo"].includes(a.status));
  const ultima = analises.find((a) => a.status === "concluida");
  const ultimoSalvo = analises.find((a) => a.status === "concluida" && a.salvo_no_historico);
  const ultimoErro = analises[0]?.status === "erro" ? analises[0] : null;
  const docsNovos = docs.filter((d) => !d.analisado && d.status !== "erro").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link href="/processos" className="text-sm text-slate-500 hover:text-slate-700">← Processos</Link>
          <h1 className="page-title mt-1 truncate">{p.cliente_nome}</h1>
          <p className="text-sm text-slate-500">
            {p.numero_processo || "Número não informado"} · {p.posicao_cliente} · <span className="capitalize">{p.area}</span>
            {p.parte_contraria ? ` · Parte contrária: ${p.parte_contraria}` : ""}
          </p>
          <p className="mt-1 text-xs text-slate-400">Última análise: {formatDate(p.ultima_analise_em, true)}</p>
        </div>
        <div className="flex gap-2">
          {ultima && (
            <Link href={`/processos/${p.id}/revisao/${ultima.id}`} className="btn-primary">Revisar andamento</Link>
          )}
          {can.excluirProcesso(user) && <ExcluirProcesso processoId={p.id} cliente={p.cliente_nome} />}
        </div>
      </div>

      {running && <AnalysisProgress analiseId={running.id} processoId={p.id} />}
      {!running && ultimoErro && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-medium">A última análise não pôde ser concluída</p>
          <p className="mt-1">{ultimoErro.erro}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">Último andamento elaborado</h2>
              {ultimoSalvo && <AnaliseStatusBadge status="concluida" aprovado={!!ultimoSalvo.aprovado_em} />}
            </div>
            {ultimoSalvo?.andamento ? (
              <>
                <p className="whitespace-pre-line rounded-lg bg-slate-50 p-4 font-serif text-[15px] leading-relaxed text-slate-800">{ultimoSalvo.andamento}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {formatDate(ultimoSalvo.created_at, true)}
                  {ultimoSalvo.aprovador ? ` · Revisado por ${ultimoSalvo.aprovador} em ${formatDate(ultimoSalvo.aprovado_em, true)}` : " · Ainda não aprovado"}
                </p>
              </>
            ) : (
              <EmptyState title="Nenhum andamento salvo no histórico">
                {ultima ? <Link href={`/processos/${p.id}/revisao/${ultima.id}`} className="font-medium text-navy-700 underline">Revise a última análise</Link> : "Envie documentos e analise o processo."}
              </EmptyState>
            )}
          </section>

          <DocumentosPanel
            processoId={p.id}
            docs={docs.map((d) => ({ ...d, created_at: d.created_at.toISOString(), tamanho_bytes: Number(d.tamanho_bytes) }))}
            podeExcluir={can.excluirDocumento(user)}
            temAnalise={!!ultima}
            docsNovos={docsNovos}
            running={!!running}
            maxMb={Math.round(config.maxFileBytes / 1024 / 1024)}
          />

          <section className="card p-5">
            <h2 className="mb-3 font-semibold text-slate-800">Histórico de análises e andamentos</h2>
            {analises.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhuma análise realizada.</p>
            ) : (
              <ol className="relative space-y-4 border-l border-slate-200 pl-5">
                {analises.map((a) => (
                  <li key={a.id} className="relative">
                    <span className="absolute -left-[26px] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-navy-400" />
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium text-slate-800">{a.tipo === "inicial" ? "Análise inicial" : "Atualização"}</span>
                      <AnaliseStatusBadge status={a.status} aprovado={!!a.aprovado_em} />
                      <span className="text-xs text-slate-500">{formatDate(a.created_at, true)}{a.solicitante ? ` · ${a.solicitante}` : ""}</span>
                    </div>
                    {a.andamento && <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-slate-600">{a.andamento}</p>}
                    {a.status === "erro" && a.erro && <p className="mt-1 text-sm text-red-700">{a.erro}</p>}
                    {a.status === "concluida" && (
                      <Link href={`/processos/${p.id}/revisao/${a.id}`} className="mt-1 inline-block text-sm font-medium text-navy-700 hover:underline">Abrir revisão</Link>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <DadosProcesso
            processo={{
              id: p.id,
              cliente_nome: p.cliente_nome,
              tratamento: p.tratamento,
              numero_processo: p.numero_processo ?? "",
              parte_contraria: p.parte_contraria ?? "",
              posicao_cliente: p.posicao_cliente,
              area: p.area,
            }}
            posicoes={[...POSICOES]}
            areas={[...AREAS]}
          />
          <ObservacoesInternas processoId={p.id} inicial={p.observacoes_internas} />
          <ConfidentialNotice compact />
        </div>
      </div>
    </div>
  );
}
