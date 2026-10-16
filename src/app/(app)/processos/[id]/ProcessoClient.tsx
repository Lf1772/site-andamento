"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileDropzone, uploadAll, type PendingFile } from "@/components/FileDropzone";
import { IconDownload, IconFile, IconLock, IconRefresh, IconTrash } from "@/components/icons";
import { api, uploadFile } from "@/components/upload";
import { formatDate } from "@/components/ui";

export function ExcluirProcesso({ processoId, cliente }: { processoId: string; cliente: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function excluir() {
    const conf = prompt(`Esta ação exclui definitivamente o processo, todas as análises e os documentos armazenados.\n\nPara confirmar, digite EXCLUIR:`);
    if (conf !== "EXCLUIR") return;
    setBusy(true);
    try {
      await api(`/api/processos/${processoId}`, { method: "DELETE" });
      router.replace("/processos");
      router.refresh();
    } catch (err) {
      alert((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <button onClick={excluir} className="btn-danger" disabled={busy} title={`Excluir processo de ${cliente}`}>
      <IconTrash /> <span className="hidden sm:inline">Excluir</span>
    </button>
  );
}

interface Doc {
  id: string;
  nome_original: string;
  tamanho_bytes: number;
  num_paginas: number | null;
  paginas_ocr: number;
  paginas_sem_texto: number;
  status: string;
  erro: string | null;
  created_at: string;
  enviado_por_nome: string | null;
  analisado: boolean;
}

export function DocumentosPanel(props: {
  processoId: string;
  docs: Doc[];
  podeExcluir: boolean;
  temAnalise: boolean;
  docsNovos: number;
  running: boolean;
  maxMb: number;
}) {
  const router = useRouter();
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarUpload, setMostrarUpload] = useState(props.docs.length === 0);

  async function enviar(analisar: boolean) {
    setErro(null);
    try {
      if (files.some((f) => f.status !== "enviado")) {
        setBusy("Enviando documentos…");
        const r = await uploadAll(props.processoId, files, setFiles, uploadFile);
        if (r.erros.length) setErro(r.erros.join(" "));
      }
      if (analisar) {
        setBusy("Iniciando análise…");
        await api(`/api/processos/${props.processoId}/analisar`, { method: "POST" });
      }
      setFiles([]);
      setMostrarUpload(false);
      router.refresh();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function excluir(d: Doc) {
    if (!confirm(`Excluir definitivamente o documento "${d.nome_original}"?`)) return;
    try {
      await api(`/api/processos/${props.processoId}/documentos/${d.id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function reprocessar(d: Doc) {
    try {
      await api(`/api/processos/${props.processoId}/documentos/${d.id}`, { method: "POST" });
      router.refresh();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  const pendentesUpload = files.filter((f) => f.status !== "enviado").length;
  const podeAnalisar = !props.running && (pendentesUpload > 0 || props.docsNovos > 0);

  return (
    <section className="card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-slate-800">Documentos utilizados na análise</h2>
        <button onClick={() => setMostrarUpload((v) => !v)} className="btn-secondary py-1.5 text-xs" disabled={props.running}>
          {mostrarUpload ? "Fechar envio" : "Enviar documentos"}
        </button>
      </div>

      {props.docs.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {props.docs.map((d) => (
            <li key={d.id} className="flex flex-col gap-2 px-3 py-2.5 text-sm sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-2">
                <IconFile className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800">{d.nome_original}</p>
                  <p className="text-xs text-slate-500">
                    {d.num_paginas ?? "?"} pág. · {(d.tamanho_bytes / 1024 / 1024).toFixed(1)} MB · {formatDate(d.created_at, true)}
                    {d.enviado_por_nome ? ` · ${d.enviado_por_nome}` : ""}
                    {d.paginas_ocr > 0 ? ` · OCR em ${d.paginas_ocr} pág.` : ""}
                  </p>
                  {d.status === "erro" && <p className="mt-0.5 text-xs text-red-700">{d.erro}</p>}
                  {d.paginas_sem_texto > 0 && d.status === "extraido" && (
                    <p className="mt-0.5 text-xs text-amber-700">{d.paginas_sem_texto} página(s) sem texto legível.</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 pl-6 sm:pl-0">
                <DocStatus d={d} />
                {d.status === "erro" && (
                  <button onClick={() => reprocessar(d)} className="btn-ghost px-2 py-1" title="Tentar ler novamente"><IconRefresh /></button>
                )}
                <a href={`/api/processos/${props.processoId}/documentos/${d.id}`} className="btn-ghost px-2 py-1" title="Baixar (acesso registrado)"><IconDownload /></a>
                {props.podeExcluir && (
                  <button onClick={() => excluir(d)} className="btn-ghost px-2 py-1 text-red-600 hover:bg-red-50" title="Excluir documento"><IconTrash /></button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {(mostrarUpload || files.length > 0) && (
        <div className="mt-4 space-y-3">
          {props.temAnalise && (
            <p className="rounded-lg bg-navy-50 px-3 py-2 text-sm text-navy-800">
              Para atualizar o processo, envie os novos documentos. A nova análise compara com o histórico e destaca apenas o que mudou desde o último andamento.
            </p>
          )}
          <FileDropzone files={files} onChange={setFiles} disabled={!!busy} maxMb={props.maxMb} />
          <p className="flex items-center gap-1.5 text-xs text-slate-500"><IconLock className="h-3.5 w-3.5" /> Envie apenas documentos que você está autorizado(a) a tratar.</p>
        </div>
      )}

      {erro && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        {busy && <span className="text-sm text-slate-500 sm:mr-auto">{busy}</span>}
        {pendentesUpload > 0 && (
          <button onClick={() => enviar(false)} className="btn-secondary" disabled={!!busy}>Apenas enviar</button>
        )}
        <button onClick={() => enviar(true)} className="btn-primary" disabled={!!busy || !podeAnalisar}>
          {props.temAnalise ? "Atualizar processo" : "Analisar processo"}
          {props.docsNovos + pendentesUpload > 0 ? ` (${props.docsNovos + pendentesUpload} novo${props.docsNovos + pendentesUpload > 1 ? "s" : ""})` : ""}
        </button>
      </div>
    </section>
  );
}

function DocStatus({ d }: { d: Doc }) {
  if (d.status === "erro") return <span className="badge bg-red-50 text-red-700">Não lido</span>;
  if (d.status === "pendente" || d.status === "extraindo") return <span className="badge bg-blue-50 text-blue-700">Lendo…</span>;
  if (!d.analisado) return <span className="badge bg-amber-50 text-amber-800">Novo</span>;
  return <span className="badge bg-emerald-50 text-emerald-700">Analisado</span>;
}

export function DadosProcesso({
  processo,
  posicoes,
  areas,
}: {
  processo: { id: string; cliente_nome: string; tratamento: string; numero_processo: string; parte_contraria: string; posicao_cliente: string; area: string };
  posicoes: string[];
  areas: string[];
}) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState(processo);
  const [msg, setMsg] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function salvar() {
    try {
      const { id, ...body } = form;
      await api(`/api/processos/${id}`, { method: "PATCH", json: body });
      setEdit(false);
      setMsg(null);
      router.refresh();
    } catch (err) {
      setMsg((err as Error).message);
    }
  }

  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-slate-800">Dados do processo</h2>
        {!edit && <button onClick={() => setEdit(true)} className="text-sm font-medium text-navy-700 hover:underline">Editar</button>}
      </div>
      {edit ? (
        <div className="space-y-3">
          <input className="input" value={form.cliente_nome} onChange={set("cliente_nome")} aria-label="Nome do cliente" />
          <select className="input" value={form.tratamento} onChange={set("tratamento")} aria-label="Tratamento">
            <option value="neutro">Prezado(a) Sr.(a)</option>
            <option value="sr">Prezado Sr.</option>
            <option value="sra">Prezada Sra.</option>
          </select>
          <select className="input" value={form.posicao_cliente} onChange={set("posicao_cliente")} aria-label="Posição">
            {[...new Set([form.posicao_cliente, ...posicoes])].map((p) => <option key={p}>{p}</option>)}
          </select>
          <input className="input" value={form.numero_processo} onChange={set("numero_processo")} placeholder="Número do processo" aria-label="Número do processo" />
          <input className="input" value={form.parte_contraria} onChange={set("parte_contraria")} placeholder="Parte contrária" aria-label="Parte contrária" />
          <select className="input" value={form.area} onChange={set("area")} aria-label="Área">
            {areas.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          {msg && <p className="text-sm text-red-700">{msg}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => { setForm(processo); setEdit(false); }} className="btn-ghost">Cancelar</button>
            <button onClick={salvar} className="btn-primary">Salvar</button>
          </div>
        </div>
      ) : (
        <dl className="space-y-2 text-sm">
          <Row k="Cliente" v={processo.cliente_nome} />
          <Row k="Posição" v={processo.posicao_cliente} />
          <Row k="Número" v={processo.numero_processo || "—"} />
          <Row k="Parte contrária" v={processo.parte_contraria || "—"} />
          <Row k="Área" v={processo.area} />
        </dl>
      )}
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-right font-medium text-slate-800">{v}</dd>
    </div>
  );
}

export function ObservacoesInternas({ processoId, inicial }: { processoId: string; inicial: string }) {
  const [texto, setTexto] = useState(inicial);
  const [status, setStatus] = useState<string | null>(null);
  async function salvar() {
    setStatus("Salvando…");
    try {
      await api(`/api/processos/${processoId}`, { method: "PATCH", json: { observacoes_internas: texto } });
      setStatus("Salvo");
    } catch (err) {
      setStatus((err as Error).message);
    }
  }
  return (
    <section className="card p-5">
      <h2 className="font-semibold text-slate-800">Observações internas</h2>
      <p className="mb-2 text-xs text-slate-500">Uso exclusivo do escritório. Orientam a análise, mas nunca são incluídas no andamento ao cliente.</p>
      <textarea rows={5} className="input" value={texto} onChange={(e) => { setTexto(e.target.value); setStatus(null); }} maxLength={10000} />
      <div className="mt-2 flex items-center justify-end gap-3">
        {status && <span className="text-xs text-slate-500">{status}</span>}
        <button onClick={salvar} className="btn-secondary py-1.5 text-xs" disabled={texto === inicial && status !== null}>Salvar observações</button>
      </div>
    </section>
  );
}
