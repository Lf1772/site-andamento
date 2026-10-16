import Link from "next/link";
import { EmptyState, formatDate } from "@/components/ui";
import { IconPlus } from "@/components/icons";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";

export const metadata = { title: "Processos" };

export default async function ProcessosPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const q = ((await searchParams).q ?? "").trim().slice(0, 100);
  const rows = await query<{
    id: string;
    cliente_nome: string;
    numero_processo: string | null;
    posicao_cliente: string;
    area: string;
    ultima_analise_em: Date | null;
    docs: string;
  }>(
    `SELECT p.id, p.cliente_nome, p.numero_processo, p.posicao_cliente, p.area, p.ultima_analise_em,
            (SELECT count(*) FROM documentos d WHERE d.processo_id = p.id) AS docs
       FROM processos p
      WHERE p.escritorio_id = $1 AND ($2 = '' OR p.cliente_nome ILIKE '%' || $2 || '%' OR p.numero_processo ILIKE '%' || $2 || '%' OR p.parte_contraria ILIKE '%' || $2 || '%')
      ORDER BY p.updated_at DESC LIMIT 300`,
    [user.escritorioId, q],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="page-title">Processos</h1>
          <p className="text-sm text-slate-500">Consulte as análises anteriores e atualize processos existentes.</p>
        </div>
        <Link href="/processos/novo" className="btn-primary">
          <IconPlus className="h-4 w-4" /> Novo processo
        </Link>
      </div>
      <form className="flex gap-2" role="search">
        <input name="q" defaultValue={q} placeholder="Buscar por cliente, número do processo ou parte contrária" className="input" />
        <button className="btn-secondary">Buscar</button>
      </form>
      {rows.length === 0 ? (
        <EmptyState title={q ? "Nenhum processo encontrado" : "Nenhum processo cadastrado"} />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="hidden bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 md:table-header-group">
              <tr>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Processo</th>
                <th className="px-4 py-3 font-medium">Posição</th>
                <th className="px-4 py-3 font-medium">Documentos</th>
                <th className="px-4 py-3 font-medium">Última análise</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((p) => (
                <tr key={p.id} className="block hover:bg-slate-50 md:table-row">
                  <td className="block px-4 pt-3 md:table-cell md:py-3">
                    <Link href={`/processos/${p.id}`} className="font-medium text-navy-800 hover:underline">{p.cliente_nome}</Link>
                    <span className="ml-2 text-xs capitalize text-slate-400">{p.area}</span>
                  </td>
                  <td className="block px-4 text-slate-600 md:table-cell md:py-3">{p.numero_processo || "—"}</td>
                  <td className="block px-4 text-slate-600 md:table-cell md:py-3">{p.posicao_cliente}</td>
                  <td className="hidden px-4 text-slate-600 md:table-cell md:py-3">{p.docs}</td>
                  <td className="block px-4 pb-3 text-xs text-slate-500 md:table-cell md:py-3 md:text-sm">{formatDate(p.ultima_analise_em, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
