import { notFound } from "next/navigation";
import { formatDate } from "@/components/ui";
import { can, requireUser } from "@/lib/auth";
import { query } from "@/lib/db";

export const metadata = { title: "Auditoria" };

const ACOES: Record<string, string> = {
  login: "Login",
  login_falhou: "Tentativa de login malsucedida",
  logout: "Logout",
  processo_criado: "Processo cadastrado",
  processo_alterado: "Processo alterado",
  processo_excluido: "Processo excluído",
  processo_excluido_retencao: "Processo excluído (retenção)",
  documentos_enviados: "Documentos enviados",
  documento_baixado: "Documento baixado",
  documento_excluido: "Documento excluído",
  analise_solicitada: "Análise solicitada",
  atualizacao_solicitada: "Atualização solicitada",
  revisao_editada: "Revisão editada",
  andamento_regenerado: "Novo texto gerado",
  andamento_aprovado: "Andamento aprovado",
  aprovacao_revogada: "Aprovação revogada",
  andamento_salvo_no_historico: "Andamento salvo no histórico",
  andamento_copiado: "Andamento copiado",
  andamento_pdf_baixado: "PDF do andamento baixado",
  usuario_criado: "Usuário criado",
  usuario_alterado: "Usuário alterado",
  configuracoes_alteradas: "Configurações alteradas",
};

export default async function AuditoriaPage({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const user = await requireUser();
  if (!can.verAuditoria(user)) notFound();
  const pagina = Math.max(1, Number((await searchParams).pagina) || 1);
  const rows = await query<{ id: string; acao: string; entidade: string | null; entidade_id: string | null; ip: string | null; created_at: Date; nome: string | null }>(
    `SELECT a.id, a.acao, a.entidade, a.entidade_id, a.ip, a.created_at, u.nome
       FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id
      WHERE a.escritorio_id = $1 ORDER BY a.created_at DESC LIMIT 100 OFFSET $2`,
    [user.escritorioId, (pagina - 1) * 100],
  );
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Auditoria</h1>
        <p className="text-sm text-slate-500">Registro de acessos e alterações relevantes.</p>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Data</th>
              <th className="px-4 py-3 font-medium">Usuário</th>
              <th className="px-4 py-3 font-medium">Ação</th>
              <th className="px-4 py-3 font-medium">Objeto</th>
              <th className="px-4 py-3 font-medium">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap px-4 py-2 text-slate-600">{formatDate(r.created_at, true)}</td>
                <td className="px-4 py-2 text-slate-800">{r.nome ?? "—"}</td>
                <td className="px-4 py-2 text-slate-800">{ACOES[r.acao] ?? r.acao}</td>
                <td className="px-4 py-2 font-mono text-xs text-slate-500">{r.entidade ? `${r.entidade} ${r.entidade_id?.slice(0, 8) ?? ""}` : "—"}</td>
                <td className="px-4 py-2 font-mono text-xs text-slate-500">{r.ip ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between text-sm">
        {pagina > 1 ? <a href={`?pagina=${pagina - 1}`} className="btn-secondary">Anterior</a> : <span />}
        {rows.length === 100 && <a href={`?pagina=${pagina + 1}`} className="btn-secondary">Próxima</a>}
      </div>
    </div>
  );
}
