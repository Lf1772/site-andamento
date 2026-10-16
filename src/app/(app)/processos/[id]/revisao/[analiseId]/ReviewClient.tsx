"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { IconAlert, IconCheck, IconCopy, IconDownload, IconRefresh } from "@/components/icons";
import { api } from "@/components/upload";
import { formatDate } from "@/components/ui";
import type { Analise, CamposRevisao, Citacao, ItemFundamentado } from "@/lib/ai/schemas";

const VARIANTES = [
  { key: "padrao", label: "Andamento padrão" },
  { key: "resumido", label: "Andamento resumido" },
  { key: "detalhado", label: "Andamento detalhado" },
  { key: "simples", label: "Linguagem ainda mais simples" },
];
const FORMALIDADES = [
  { key: "padrao", label: "Formalidade padrão" },
  { key: "mais_formal", label: "Mais formal" },
  { key: "menos_formal", label: "Mais próximo e cordial" },
];

const FASE_LABEL: Record<string, string> = {
  conhecimento: "Conhecimento",
  recursal: "Recursal",
  liquidacao: "Liquidação",
  execucao: "Execução",
  cumprimento_de_sentenca: "Cumprimento de sentença",
  acordo_homologado: "Acordo homologado",
  arquivado: "Arquivado",
  suspenso: "Suspenso",
  outra: "Outra",
  indeterminada: "Indeterminada",
};
const INSTANCIA_LABEL: Record<string, string> = {
  primeira_instancia: "1ª instância",
  segunda_instancia: "2ª instância",
  tribunal_superior: "Tribunal superior",
  indeterminada: "Indeterminada",
};
const NATUREZA_LABEL: Record<string, { label: string; cls: string }> = {
  fato_documentado: { label: "Fato documentado", cls: "bg-emerald-50 text-emerald-700" },
  interpretacao: { label: "Interpretação", cls: "bg-blue-50 text-blue-700" },
  previsao: { label: "Previsão", cls: "bg-purple-50 text-purple-700" },
};
const DECISAO_STATUS: Record<string, string> = {
  proferida_sujeita_a_recurso: "Proferida — sujeita a recurso",
  definitiva_com_transito_documentado: "Definitiva (trânsito documentado)",
  modificada_por_decisao_posterior: "Modificada por decisão posterior",
  status_incerto: "Status incerto",
};

interface Props {
  processo: { id: string; cliente_nome: string; posicao_cliente: string };
  analise: {
    id: string;
    tipo: string;
    created_at: string;
    campos: CamposRevisao;
    andamento: string;
    variante: string;
    formalidade: string;
    aprovado_em: string | null;
    aprovador: string | null;
    salvo_no_historico: boolean;
    resultado: Analise & { _meta?: { modo: string } };
    custo: number;
    modelo: string | null;
  };
  documentos: Record<string, { id: string; nome: string }>;
  versoes: { id: string; texto: string; variante: string; origem: string; created_at: string; autor: string | null }[];
}

export function ReviewClient({ processo, analise, documentos, versoes }: Props) {
  const router = useRouter();
  const r = analise.resultado;
  const [campos, setCampos] = useState<CamposRevisao>(analise.campos);
  const [andamento, setAndamento] = useState(analise.andamento);
  const [variante, setVariante] = useState(analise.variante);
  const [formalidade, setFormalidade] = useState(analise.formalidade);
  const [instrucao, setInstrucao] = useState("");
  const [obsRevisor, setObsRevisor] = useState<string[]>([]);
  const [aprovado, setAprovado] = useState<{ em: string | null; por: string | null }>({ em: analise.aprovado_em, por: analise.aprovador });
  const [salvo, setSalvo] = useState(analise.salvo_no_historico);
  const [confirmo, setConfirmo] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saved, setSaved] = useState({ campos: analise.campos, andamento: analise.andamento });

  const dirty = JSON.stringify(campos) !== JSON.stringify(saved.campos) || andamento !== saved.andamento;
  const palavras = useMemo(() => andamento.trim().split(/\s+/).filter(Boolean).length, [andamento]);
  const alertasAltos = r.alertas.filter((a) => a.gravidade === "alta").length;

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  function setCampo(k: keyof CamposRevisao, v: string) {
    setCampos((c) => ({ ...c, [k]: v }));
    if (aprovado.em) setAprovado({ em: null, por: null });
  }

  async function salvar(salvarNoHistorico = false) {
    setErro(null);
    setBusy("Salvando…");
    try {
      await api(`/api/analises/${analise.id}`, { method: "PATCH", json: { campos, andamento, salvar_no_historico: salvarNoHistorico } });
      const changed = dirty;
      setSaved({ campos, andamento });
      if (changed) setAprovado({ em: null, por: null });
      if (salvarNoHistorico) {
        setSalvo(true);
        flash("Salvo no histórico do processo");
      } else flash("Alterações salvas");
      router.refresh();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function gerar(v = variante, f = formalidade) {
    setErro(null);
    setBusy("Gerando novo texto…");
    try {
      const res = await api<{ andamento: string; observacoes: string[] }>(`/api/analises/${analise.id}/gerar`, {
        method: "POST",
        json: { campos, variante: v, formalidade: f, instrucao },
      });
      setAndamento(res.andamento);
      setSaved({ campos, andamento: res.andamento });
      setObsRevisor(res.observacoes);
      setVariante(v);
      setFormalidade(f);
      setAprovado({ em: null, por: null });
      setConfirmo(false);
      setInstrucao("");
      router.refresh();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function aprovar() {
    setErro(null);
    setBusy("Registrando revisão…");
    try {
      if (dirty) {
        await api(`/api/analises/${analise.id}`, { method: "PATCH", json: { campos, andamento } });
        setSaved({ campos, andamento });
      }
      await api(`/api/analises/${analise.id}/aprovar`, { method: "POST", json: {} });
      setAprovado({ em: new Date().toISOString(), por: "você" });
      setSalvo(true);
      flash("Andamento revisado e pronto para envio");
      router.refresh();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(andamento);
      flash("Andamento copiado");
      fetch(`/api/analises/${analise.id}/copiado`, { method: "POST" }).catch(() => {});
    } catch {
      setErro("Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.");
    }
  }

  const prontoParaEnvio = !!aprovado.em && !dirty;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href={`/processos/${processo.id}`} className="text-sm text-slate-500 hover:text-slate-700">← {processo.cliente_nome}</Link>
          <h1 className="page-title mt-1">Revisão do andamento</h1>
          <p className="text-sm text-slate-500">
            {analise.tipo === "inicial" ? "Análise inicial" : "Atualização"} de {formatDate(analise.created_at, true)} · Revise e ajuste antes de aprovar.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {prontoParaEnvio ? (
            <span className="badge bg-emerald-50 py-1 text-emerald-700">
              <IconCheck className="mr-1 h-3.5 w-3.5" /> Revisado{aprovado.por ? ` por ${aprovado.por}` : ""}
            </span>
          ) : (
            <span className="badge bg-amber-50 py-1 text-amber-800">Aguardando revisão humana</span>
          )}
          {salvo && <span className="badge bg-slate-100 py-1 text-slate-600">No histórico</span>}
        </div>
      </div>

      {r.alertas.length > 0 && (
        <section className={`rounded-xl border p-4 ${alertasAltos ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
          <div className="flex items-center gap-2">
            <IconAlert className={`h-5 w-5 ${alertasAltos ? "text-red-700" : "text-amber-700"}`} />
            <h2 className="font-semibold text-slate-900">Alertas internos ({r.alertas.length})</h2>
            <span className="text-xs text-slate-600">— visíveis apenas para o escritório</span>
          </div>
          <ul className="mt-2 space-y-1.5 text-sm">
            {r.alertas.map((a, i) => (
              <li key={i} className="flex gap-2">
                <span className={`badge h-fit shrink-0 ${a.gravidade === "alta" ? "bg-red-100 text-red-800" : a.gravidade === "media" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>
                  {a.gravidade}
                </span>
                <span className="text-slate-800">
                  {a.mensagem}
                  {a.comunicar_ao_cliente && <em className="ml-1 text-xs text-slate-500">(pode precisar ser comunicado ao cliente)</em>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {r.novidades_desde_ultimo_andamento.length > 0 && (
        <section className="rounded-xl border border-navy-200 bg-navy-50 p-4">
          <h2 className="font-semibold text-navy-900">O que mudou desde o último andamento</h2>
          <ItemList items={r.novidades_desde_ultimo_andamento} documentos={documentos} processoId={processo.id} />
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card space-y-4 p-5">
          <h2 className="font-semibold text-slate-800">Informações identificadas</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome do cliente" value={campos.cliente_nome} onChange={(v) => setCampo("cliente_nome", v)} single />
            <Field label="Número do processo" value={campos.numero_processo} onChange={(v) => setCampo("numero_processo", v)} single citacoes={r.numero_processo.citacoes} documentos={documentos} processoId={processo.id} />
          </div>
          <Field
            label="Fase processual"
            tag={`${FASE_LABEL[r.fase.valor] ?? r.fase.valor}${r.fase.determinavel ? "" : " · não determinada"}`}
            value={campos.fase_processual}
            onChange={(v) => setCampo("fase_processual", v)}
            citacoes={r.fase.citacoes}
            documentos={documentos}
            processoId={processo.id}
          />
          <Field
            label="Instância atual"
            tag={INSTANCIA_LABEL[r.instancia.valor]}
            value={campos.instancia_atual}
            onChange={(v) => setCampo("instancia_atual", v)}
            citacoes={r.instancia.citacoes}
            documentos={documentos}
            processoId={processo.id}
            hint={r.instancia.justificativa}
          />
          <Field
            label="Última movimentação relevante"
            tag={r.ultima_movimentacao.data ?? undefined}
            value={campos.ultima_movimentacao}
            onChange={(v) => setCampo("ultima_movimentacao", v)}
            citacoes={r.ultima_movimentacao.citacoes}
            documentos={documentos}
            processoId={processo.id}
            hint={r.ultima_movimentacao.e_decisao_de_merito ? undefined : "Movimentação sem decisão de mérito."}
          />
          <Field
            label="Resultado favorável"
            value={campos.resultado_favoravel}
            onChange={(v) => setCampo("resultado_favoravel", v)}
            citacoes={r.resultados_favoraveis.flatMap((i) => i.citacoes)}
            documentos={documentos}
            processoId={processo.id}
            accent="emerald"
          />
          <Field
            label="Resultado desfavorável"
            value={campos.resultado_desfavoravel}
            onChange={(v) => setCampo("resultado_desfavoravel", v)}
            citacoes={r.resultados_desfavoraveis.flatMap((i) => i.citacoes)}
            documentos={documentos}
            processoId={processo.id}
            accent="red"
          />
          <Field
            label="Próxima etapa"
            tag={r.proxima_etapa.e_apenas_possibilidade ? "possibilidade" : undefined}
            value={campos.proxima_etapa}
            onChange={(v) => setCampo("proxima_etapa", v)}
            citacoes={r.proxima_etapa.citacoes}
            documentos={documentos}
            processoId={processo.id}
          />
        </section>

        <section className="space-y-4">
          <div className="card p-5">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">Andamento final para o cliente</h2>
              <span className={`text-xs ${palavras > 180 && variante === "padrao" ? "text-amber-700" : "text-slate-500"}`}>{palavras} palavras</span>
            </div>
            <textarea
              value={andamento}
              onChange={(e) => {
                setAndamento(e.target.value);
                if (aprovado.em) setAprovado({ em: null, por: null });
              }}
              rows={18}
              className="input font-serif text-[15px] leading-relaxed"
              aria-label="Texto do andamento"
            />
            {obsRevisor.length > 0 && (
              <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <p className="font-medium">Pontos para conferir antes do envio:</p>
                <ul className="mt-1 list-disc pl-5">{obsRevisor.map((o, i) => <li key={i}>{o}</li>)}</ul>
              </div>
            )}

            <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
              <p className="text-sm font-medium text-slate-700">Gerar novo texto</p>
              <div className="flex flex-wrap gap-2">
                {VARIANTES.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => gerar(v.key, formalidade)}
                    disabled={!!busy}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                      variante === v.key ? "border-navy-700 bg-navy-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <select value={formalidade} onChange={(e) => setFormalidade(e.target.value)} className="input sm:w-56" aria-label="Nível de formalidade">
                  {FORMALIDADES.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
                <input value={instrucao} onChange={(e) => setInstrucao(e.target.value)} maxLength={1000} className="input" placeholder="Ajuste opcional (ex.: mencionar a audiência marcada)" />
              </div>
              <button type="button" onClick={() => gerar()} disabled={!!busy} className="btn-secondary w-full sm:w-auto">
                <IconRefresh /> Gerar novo texto com os campos revisados
              </button>
            </div>
          </div>

          <div className="card space-y-3 p-5">
            <h2 className="font-semibold text-slate-800">Revisão e envio</h2>
            {!prontoParaEnvio && (
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" className="mt-0.5" checked={confirmo} onChange={(e) => setConfirmo(e.target.checked)} />
                Revisei as informações e o texto, conferi os alertas internos e confirmo que o andamento está correto para envio ao cliente.
              </label>
            )}
            {erro && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
            <div className="flex flex-wrap gap-2">
              {!prontoParaEnvio && (
                <button onClick={aprovar} disabled={!confirmo || !!busy || !andamento.trim()} className="btn-primary">
                  <IconCheck /> Aprovar andamento
                </button>
              )}
              <button onClick={copiar} disabled={!prontoParaEnvio || !!busy} className="btn-primary" title={prontoParaEnvio ? "Copia apenas o texto destinado ao cliente" : "Aprove o andamento para liberar"}>
                <IconCopy /> Copiar andamento
              </button>
              <a
                href={prontoParaEnvio ? `/api/analises/${analise.id}/pdf` : undefined}
                aria-disabled={!prontoParaEnvio}
                className={`btn-secondary ${prontoParaEnvio ? "" : "pointer-events-none opacity-50"}`}
              >
                <IconDownload /> Baixar em PDF
              </a>
              <button onClick={() => salvar(true)} disabled={!!busy} className="btn-secondary">
                Salvar no histórico
              </button>
              {dirty && (
                <button onClick={() => salvar(false)} disabled={!!busy} className="btn-ghost">
                  Salvar rascunho
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500" aria-live="polite">
              {busy ??
                (prontoParaEnvio
                  ? "O botão copiar inclui somente o texto ao cliente — sem alertas, citações ou observações internas."
                  : "Copiar e baixar ficam disponíveis após a revisão humana. Qualquer alteração exige nova aprovação.")}
            </p>
          </div>
        </section>
      </div>

      <AnaliseDetalhada r={r} documentos={documentos} processoId={processo.id} />

      <details className="card p-5">
        <summary className="cursor-pointer font-semibold text-slate-800">Versões do texto ({versoes.length})</summary>
        <ul className="mt-3 space-y-3">
          {versoes.map((v) => (
            <li key={v.id} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>{formatDate(v.created_at, true)}</span>
                <span>· {v.origem === "ia" ? "Gerado pela IA" : "Edição manual"}</span>
                <span>· {VARIANTES.find((x) => x.key === v.variante)?.label ?? v.variante}</span>
                {v.autor && <span>· {v.autor}</span>}
                <button
                  onClick={() => {
                    setAndamento(v.texto);
                    setAprovado({ em: null, por: null });
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="ml-auto font-medium text-navy-700 hover:underline"
                >
                  Restaurar
                </button>
              </div>
              <p className="line-clamp-4 whitespace-pre-line text-sm text-slate-700">{v.texto}</p>
            </li>
          ))}
        </ul>
      </details>

      <p className="text-xs text-slate-400">
        Modelo: {analise.modelo ?? "—"} · Custo estimado de IA desta análise: US$ {analise.custo.toFixed(2)} · Modo de leitura: {r._meta?.modo?.replace(/_/g, " ") ?? "—"}
      </p>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-navy-900 px-4 py-2 text-sm text-white shadow-lg" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  single?: boolean;
  tag?: string;
  hint?: string;
  citacoes?: Citacao[];
  documentos?: Props["documentos"];
  processoId?: string;
  accent?: "emerald" | "red";
}) {
  const id = props.label.toLowerCase().replace(/\W+/g, "-");
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <label htmlFor={id} className={`text-sm font-medium ${props.accent === "emerald" ? "text-emerald-800" : props.accent === "red" ? "text-red-800" : "text-slate-700"}`}>
          {props.label}
        </label>
        {props.tag && <span className="badge bg-slate-100 text-slate-600">{props.tag}</span>}
      </div>
      {props.single ? (
        <input id={id} className="input" value={props.value} onChange={(e) => props.onChange(e.target.value)} />
      ) : (
        <textarea id={id} className="input" rows={Math.min(8, Math.max(2, Math.ceil(props.value.length / 70)))} value={props.value} onChange={(e) => props.onChange(e.target.value)} />
      )}
      {props.hint && <p className="mt-1 text-xs text-slate-500">{props.hint}</p>}
      {props.citacoes && props.citacoes.length > 0 && props.documentos && <Fontes citacoes={props.citacoes} documentos={props.documentos} processoId={props.processoId!} />}
      {props.citacoes && props.citacoes.length === 0 && !props.single && <p className="mt-1 text-xs text-amber-700">Sem fundamentação documental indicada — confira.</p>}
    </div>
  );
}

function Fontes({ citacoes, documentos, processoId }: { citacoes: Citacao[]; documentos: Props["documentos"]; processoId: string }) {
  return (
    <details className="mt-1 text-xs">
      <summary className="cursor-pointer text-navy-700">Fundamentação ({citacoes.length})</summary>
      <ul className="mt-1 space-y-1">
        {citacoes.map((c, i) => {
          const doc = documentos[c.documento];
          return (
            <li key={i} className="rounded bg-slate-50 px-2 py-1 text-slate-600">
              <span className="font-medium text-slate-700">
                {doc ? (
                  <a href={`/api/processos/${processoId}/documentos/${doc.id}`} className="hover:underline">{doc.nome}</a>
                ) : (
                  c.documento
                )}
                {c.pagina ? `, p. ${c.pagina}` : ""}:
              </span>{" "}
              “{c.trecho}”
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function ItemList({ items, documentos, processoId }: { items: ItemFundamentado[]; documentos: Props["documentos"]; processoId: string }) {
  return (
    <ul className="mt-2 space-y-2 text-sm">
      {items.map((it, i) => (
        <li key={i}>
          <div className="flex gap-2">
            <span className={`badge h-fit shrink-0 ${NATUREZA_LABEL[it.natureza]?.cls}`}>{NATUREZA_LABEL[it.natureza]?.label}</span>
            <span className="text-slate-800">{it.texto}</span>
          </div>
          {it.citacoes.length > 0 && <Fontes citacoes={it.citacoes} documentos={documentos} processoId={processoId} />}
        </li>
      ))}
    </ul>
  );
}

function AnaliseDetalhada({ r, documentos, processoId }: { r: Analise; documentos: Props["documentos"]; processoId: string }) {
  return (
    <details className="card p-5">
      <summary className="cursor-pointer font-semibold text-slate-800">Análise detalhada (uso interno)</summary>
      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <Bloco titulo="Órgão julgador">
          <p className="text-sm text-slate-700">
            {[r.orgao.justica, r.orgao.tribunal, r.orgao.vara].filter(Boolean).join(" · ") || "Não identificado"}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Cliente: {r.cliente.nome} — {r.cliente.posicao}
            {!r.cliente.posicao_confirmada_nos_documentos && <span className="text-amber-700"> (posição não confirmada nos documentos)</span>}
          </p>
          <p className="mt-1 text-sm text-slate-600">Trânsito em julgado: {r.transito_em_julgado.documentado ? "documentado" : "não documentado"}</p>
        </Bloco>

        <Bloco titulo="Pedidos reconhecidos / pontos favoráveis">
          {r.resultados_favoraveis.length ? <ItemList items={r.resultados_favoraveis} documentos={documentos} processoId={processoId} /> : <Vazio />}
        </Bloco>
        <Bloco titulo="Pedidos negados / pontos desfavoráveis">
          {r.resultados_desfavoraveis.length ? <ItemList items={r.resultados_desfavoraveis} documentos={documentos} processoId={processoId} /> : <Vazio />}
        </Bloco>
        <Bloco titulo="Providências pendentes">
          {r.providencias_pendentes.length ? <ItemList items={r.providencias_pendentes} documentos={documentos} processoId={processoId} /> : <Vazio />}
        </Bloco>

        <Bloco titulo="Decisões">
          {r.decisoes.length ? (
            <ul className="space-y-2 text-sm">
              {r.decisoes.map((d, i) => (
                <li key={i} className="rounded-lg border border-slate-200 p-2">
                  <p className="font-medium text-slate-800">
                    {d.tipo.replace(/_/g, " ")} {d.data ? `· ${d.data}` : ""} {d.orgao ? `· ${d.orgao}` : ""}
                  </p>
                  <p className="text-xs text-navy-700">{DECISAO_STATUS[d.status]}</p>
                  <p className="mt-1 text-slate-700">{d.resumo}</p>
                  <Fontes citacoes={d.citacoes} documentos={documentos} processoId={processoId} />
                </li>
              ))}
            </ul>
          ) : (
            <Vazio />
          )}
        </Bloco>

        <Bloco titulo="Recursos">
          {r.recursos.length ? (
            <ul className="space-y-2 text-sm">
              {r.recursos.map((rc, i) => (
                <li key={i} className="rounded-lg border border-slate-200 p-2">
                  <p className="font-medium text-slate-800">
                    {rc.tipo} · interposto por {rc.interposto_por} {rc.data ? `· ${rc.data}` : ""}
                  </p>
                  <p className="text-xs text-navy-700">{rc.situacao === "julgado" ? "Julgado" : rc.situacao === "aguardando_julgamento" ? "Aguardando julgamento" : "Situação incerta"}</p>
                  <p className="mt-1 text-slate-700">Objetivo: {rc.objetivo}</p>
                  {rc.resultado && <p className="text-slate-700">Resultado: {rc.resultado}</p>}
                  {rc.alteracoes_na_decisao_anterior && <p className="text-slate-700">Alterações: {rc.alteracoes_na_decisao_anterior}</p>}
                  <Fontes citacoes={rc.citacoes} documentos={documentos} processoId={processoId} />
                </li>
              ))}
            </ul>
          ) : (
            <Vazio />
          )}
        </Bloco>

        <Bloco titulo="Valores documentados">
          {r.valores.length ? (
            <ul className="space-y-2 text-sm">
              {r.valores.map((v, i) => (
                <li key={i}>
                  <p className="text-slate-800">
                    <strong>{v.valor}</strong> — {v.descricao} <span className="text-xs text-slate-500">({v.situacao.replace(/_/g, " ")})</span>
                  </p>
                  <Fontes citacoes={v.citacoes} documentos={documentos} processoId={processoId} />
                </li>
              ))}
            </ul>
          ) : (
            <Vazio />
          )}
        </Bloco>

        <Bloco titulo="Prazos e determinações">
          {r.prazos.length ? (
            <ul className="space-y-2 text-sm">
              {r.prazos.map((p, i) => (
                <li key={i}>
                  <p className="text-slate-800">
                    {p.descricao}
                    {p.data_limite ? ` — até ${p.data_limite}` : ""}
                    {p.responsavel ? ` — responsável: ${p.responsavel}` : ""}
                    {!p.confirmado_nos_documentos && <span className="text-amber-700"> (não confirmado)</span>}
                  </p>
                  <Fontes citacoes={p.citacoes} documentos={documentos} processoId={processoId} />
                </li>
              ))}
            </ul>
          ) : (
            <Vazio />
          )}
        </Bloco>
      </div>

      <Bloco titulo="Cronologia" className="mt-6">
        <ol className="space-y-2 border-l border-slate-200 pl-4 text-sm">
          {r.cronologia.map((c, i) => (
            <li key={i}>
              <p className="text-slate-800">
                <span className="font-medium">{c.data ?? "s/ data"}</span> · <span className="text-xs text-slate-500">{c.tipo.replace(/_/g, " ")}</span> — {c.evento}
              </p>
              <Fontes citacoes={c.citacoes} documentos={documentos} processoId={processoId} />
            </li>
          ))}
        </ol>
      </Bloco>
    </details>
  );
}

function Bloco({ titulo, children, className = "" }: { titulo: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{titulo}</h3>
      {children}
    </div>
  );
}

const Vazio = () => <p className="text-sm text-slate-400">Nada identificado nos documentos.</p>;
