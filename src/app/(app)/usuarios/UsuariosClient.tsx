"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/upload";
import { formatDate } from "@/components/ui";

const PAPEIS = { admin: "Administrador", advogado: "Advogado(a)", estagiario: "Estagiário(a)" } as const;

interface U {
  id: string;
  nome: string;
  email: string;
  papel: keyof typeof PAPEIS;
  ativo: boolean;
  ultimo_login: string | null;
}

export function UsuariosClient({ usuarios, meuId }: { usuarios: U[]; meuId: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ nome: "", email: "", senha: "", papel: "advogado" });
  const [erro, setErro] = useState<string | null>(null);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await api("/api/usuarios", { method: "POST", json: form });
      setForm({ nome: "", email: "", senha: "", papel: "advogado" });
      router.refresh();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function alterar(id: string, body: Record<string, unknown>) {
    try {
      await api(`/api/usuarios/${id}`, { method: "PATCH", json: body });
      router.refresh();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="card overflow-x-auto lg:col-span-2">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Usuário</th>
              <th className="px-4 py-3 font-medium">Papel</th>
              <th className="px-4 py-3 font-medium">Último acesso</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {usuarios.map((u) => (
              <tr key={u.id} className={u.ativo ? "" : "opacity-50"}>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-800">{u.nome}</p>
                  <p className="text-xs text-slate-500">{u.email}</p>
                </td>
                <td className="px-4 py-3">
                  <select className="input py-1" value={u.papel} disabled={u.id === meuId} onChange={(e) => alterar(u.id, { papel: e.target.value })}>
                    {Object.entries(PAPEIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{formatDate(u.ultimo_login, true)}</td>
                <td className="space-x-2 whitespace-nowrap px-4 py-3 text-right">
                  <button
                    className="text-xs font-medium text-navy-700 hover:underline"
                    onClick={() => {
                      const senha = prompt("Nova senha (mínimo de 12 caracteres):");
                      if (senha) alterar(u.id, { senha });
                    }}
                  >
                    Redefinir senha
                  </button>
                  {u.id !== meuId && (
                    <button className="text-xs font-medium text-red-700 hover:underline" onClick={() => alterar(u.id, { ativo: !u.ativo })}>
                      {u.ativo ? "Desativar" : "Reativar"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form onSubmit={criar} className="card space-y-3 p-5">
        <h2 className="font-semibold text-slate-800">Novo usuário</h2>
        <input className="input" placeholder="Nome completo" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        <input className="input" type="email" placeholder="E-mail" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className="input" type="password" placeholder="Senha inicial (mín. 12 caracteres)" minLength={12} required autoComplete="new-password" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} />
        <select className="input" value={form.papel} onChange={(e) => setForm({ ...form, papel: e.target.value })}>
          {Object.entries(PAPEIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {erro && <p className="text-sm text-red-700">{erro}</p>}
        <button className="btn-primary w-full">Cadastrar usuário</button>
      </form>
    </div>
  );
}
