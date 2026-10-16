"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileDropzone, uploadAll, type PendingFile } from "@/components/FileDropzone";
import { api, uploadFile } from "@/components/upload";

export function NovoProcessoForm({ posicoes, areas, maxMb }: { posicoes: string[]; areas: string[]; maxMb: number }) {
  const router = useRouter();
  const [form, setForm] = useState({
    cliente_nome: "",
    tratamento: "neutro",
    numero_processo: "",
    parte_contraria: "",
    posicao_cliente: "Reclamante",
    area: "trabalhista",
    observacoes_internas: "",
  });
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [autorizado, setAutorizado] = useState(false);
  const [etapa, setEtapa] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [processoId, setProcessoId] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (files.length === 0) return setErro("Selecione ao menos um arquivo PDF do processo.");
    try {
      let id = processoId;
      if (!id) {
        setEtapa("Cadastrando processo…");
        id = (await api<{ id: string }>("/api/processos", { method: "POST", json: form })).id;
        setProcessoId(id);
      }
      setEtapa("Enviando documentos…");
      const r = await uploadAll(id, files, setFiles, uploadFile);
      if (r.ok === 0 && !files.some((f) => f.status === "enviado")) {
        setEtapa(null);
        return setErro("Nenhum documento pôde ser enviado. " + r.erros.join(" "));
      }
      setEtapa("Iniciando análise…");
      const a = await api<{ id: string }>(`/api/processos/${id}/analisar`, { method: "POST" });
      router.push(`/processos/${id}?analise=${a.id}`);
    } catch (err) {
      setErro((err as Error).message);
      setEtapa(null);
    }
  }

  const busy = etapa !== null;

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-5">
      <div className="card space-y-4 p-5 lg:col-span-2">
        <h2 className="font-semibold text-slate-800">Dados do processo</h2>
        <div>
          <label className="label" htmlFor="cliente">Nome completo do cliente *</label>
          <input id="cliente" required minLength={3} className="input" value={form.cliente_nome} onChange={set("cliente_nome")} disabled={busy || !!processoId} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <div>
            <label className="label" htmlFor="tratamento">Tratamento</label>
            <select id="tratamento" className="input" value={form.tratamento} onChange={set("tratamento")} disabled={busy || !!processoId}>
              <option value="neutro">Prezado(a) Sr.(a)</option>
              <option value="sr">Prezado Sr.</option>
              <option value="sra">Prezada Sra.</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="posicao">Posição do cliente *</label>
            <select id="posicao" className="input" value={form.posicao_cliente} onChange={set("posicao_cliente")} disabled={busy || !!processoId}>
              {posicoes.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="numero">Número do processo</label>
          <input id="numero" className="input" placeholder="0000000-00.0000.0.00.0000" value={form.numero_processo} onChange={set("numero_processo")} disabled={busy || !!processoId} />
        </div>
        <div>
          <label className="label" htmlFor="contraria">Parte contrária (opcional)</label>
          <input id="contraria" className="input" value={form.parte_contraria} onChange={set("parte_contraria")} disabled={busy || !!processoId} />
        </div>
        <div>
          <label className="label" htmlFor="area">Área</label>
          <select id="area" className="input capitalize" value={form.area} onChange={set("area")} disabled={busy || !!processoId}>
            {areas.map((a) => <option key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="obs">Observações internas</label>
          <textarea id="obs" rows={4} className="input" placeholder="Ex.: cliente aguarda notícia sobre o recurso; não mencionar acordo em negociação." value={form.observacoes_internas} onChange={set("observacoes_internas")} disabled={busy || !!processoId} />
          <p className="mt-1 text-xs text-slate-500">Usadas apenas para orientar a análise. Nunca aparecem no texto enviado ao cliente.</p>
        </div>
      </div>

      <div className="space-y-4 lg:col-span-3">
        <div className="card space-y-4 p-5">
          <h2 className="font-semibold text-slate-800">Documentos do processo</h2>
          <FileDropzone files={files} onChange={setFiles} disabled={busy} maxMb={maxMb} />
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-0.5" checked={autorizado} onChange={(e) => setAutorizado(e.target.checked)} required />
            Declaro que estou autorizado(a) a tratar estes documentos, que contêm dados confidenciais do cliente.
          </label>
          {erro && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500" aria-live="polite">{etapa}</p>
            <button type="submit" className="btn-primary" disabled={busy || !autorizado}>
              {busy ? "Processando…" : "Enviar e analisar processo"}
            </button>
          </div>
        </div>
        <div className="rounded-xl bg-navy-50 p-4 text-sm text-navy-800">
          <p className="font-medium">Como funciona</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-navy-700">
            <li>Os PDFs são lidos integralmente (com OCR para páginas digitalizadas).</li>
            <li>A IA reconstrói a cronologia, identifica decisões, recursos e a fase atual, citando documento e página.</li>
            <li>Você revisa e ajusta as informações antes de aprovar o texto para o cliente.</li>
          </ol>
        </div>
      </div>
    </form>
  );
}
