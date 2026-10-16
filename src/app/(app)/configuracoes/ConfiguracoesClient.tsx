"use client";

import { useState } from "react";
import { api } from "@/components/upload";

export function ConfiguracoesClient({ inicial }: { inicial: { nome: string; assinatura: string; retencao_dias: number | null } }) {
  const [form, setForm] = useState(inicial);
  const [msg, setMsg] = useState<string | null>(null);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      await api("/api/configuracoes", { method: "PATCH", json: form });
      setMsg("Configurações salvas.");
    } catch (err) {
      setMsg((err as Error).message);
    }
  }

  return (
    <form onSubmit={salvar} className="grid gap-6 lg:grid-cols-2">
      <div className="card space-y-4 p-5">
        <h2 className="font-semibold text-slate-800">Escritório</h2>
        <div>
          <label className="label" htmlFor="nome">Nome do escritório</label>
          <input id="nome" className="input" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="assinatura">Assinatura dos andamentos</label>
          <input id="assinatura" className="input" placeholder="Ex.: Silva & Souza Advogados Associados" value={form.assinatura} onChange={(e) => setForm({ ...form, assinatura: e.target.value })} />
          <p className="mt-1 text-xs text-slate-500">Usada no fechamento “Atenciosamente”. Se vazia, usa o nome do escritório.</p>
        </div>
      </div>
      <div className="card space-y-4 p-5">
        <h2 className="font-semibold text-slate-800">Retenção e exclusão de dados (LGPD)</h2>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.retencao_dias !== null} onChange={(e) => setForm({ ...form, retencao_dias: e.target.checked ? 365 : null })} />
          Excluir automaticamente processos inativos
        </label>
        {form.retencao_dias !== null && (
          <div>
            <label className="label" htmlFor="ret">Excluir após (dias sem atividade)</label>
            <input id="ret" type="number" min={30} max={36500} className="input" value={form.retencao_dias} onChange={(e) => setForm({ ...form, retencao_dias: Number(e.target.value) })} />
          </div>
        )}
        <p className="text-xs leading-relaxed text-slate-500">
          A exclusão remove o processo, as análises, os andamentos e os arquivos armazenados, e é registrada na auditoria. Ela é executada pela rotina diária
          <code className="mx-1 rounded bg-slate-100 px-1">npm run retencao</code>. Processos também podem ser excluídos manualmente a qualquer momento.
        </p>
      </div>
      <div className="flex items-center justify-end gap-3 lg:col-span-2">
        {msg && <span className="text-sm text-slate-600">{msg}</span>}
        <button className="btn-primary">Salvar configurações</button>
      </div>
    </form>
  );
}
