import Link from "next/link";
import { AnaliseStatusBadge, EmptyState, formatDate } from "@/components/ui";
import { IconPlus } from "@/components/icons";
import { requireUser } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";

export const metadata = { title: "Painel" };

export default async function Dashboard() {
  const user = await requireUser();
  const recentes = await query<{
    id: string;
    cliente_nome: string;
    numero_processo: string | null;
    posicao_cliente: string;
    updated_at: Date;
    status: string | null;
    aprovado_em: Date | null;
    analise_id: string | null;
  }>(
    `SELECT p.id, p.cliente_nome, p.numero_processo, p.posicao_cliente, p.updated_at, a.status, a.aprovado_em, a.id AS analise_id
       FROM processos p
       LEFT JOIN LATERAL (SELECT id, status, aprovado_em FROM analises WHERE processo_id = p.id ORDER BY created_at DESC LIMIT 1) a ON true
      WHERE p.escritorio_id = $1 ORDER BY p.updated_at DESC LIMIT 8`,
    [user.escritorioId],
  );
  const stats = await queryOne<{ total: string; pendentes: string; mes: string }>(
    `SELECT (SELECT count(*) FROM processos WHERE escritorio_id = $1) AS total,
            (SELECT count(*) FROM analises WHERE escritorio_id = $1 AND status = 'concluida' AND aprovado_em IS NULL
               AND id IN (SELECT DISTINCT ON (processo_id) id FROM analises WHERE escritorio_id = $1 ORDER BY processo_id, created_at DESC)) AS pendentes,
            (SELECT count(*) FROM analises WHERE escritorio_id = $1 AND aprovado_em >= date_trunc('month', now())) AS mes`,
    [user.escritorioId],
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">Olá, {user.nome.split(" ")[0]}</p>
          <h1 className="page-title">Painel</h1>
        </div>
        <Link href="/processos/novo" className="btn-primary">
          <IconPlus className="h-4 w-4" /> Novo processo
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Processos cadastrados" value={stats?.total ?? "0"} />
        <Stat label="Andamentos aguardando revisão" value={stats?.pendentes ?? "0"} highlight={Number(stats?.pendentes) > 0} />
        <Stat label="Andamentos revisados neste mês" value={stats?.mes ?? "0"} />
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Processos recentes</h2>
          <Link href="/processos" className="text-sm font-medium text-navy-600 hover:text-navy-800">Ver todos</Link>
        </div>
        {recentes.length === 0 ? (
          <EmptyState title="Nenhum processo cadastrado ainda">
            Comece em <Link href="/processos/novo" className="font-medium text-navy-700 underline">Novo processo</Link>: envie os PDFs e receba um andamento pronto para revisão.
          </EmptyState>
        ) : (
          <div className="card divide-y divide-slate-100">
            {recentes.map((p) => (
              <Link key={p.id} href={`/processos/${p.id}`} className="flex flex-col gap-1 px-4 py-3 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{p.cliente_nome}</p>
                  <p className="truncate text-xs text-slate-500">
                    {p.numero_processo || "Número não informado"} · {p.posicao_cliente}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  {p.status ? <AnaliseStatusBadge status={p.status} aprovado={!!p.aprovado_em} /> : <span className="badge bg-slate-100 text-slate-600">Sem análise</span>}
                  <span>{formatDate(p.updated_at)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="card px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${highlight ? "text-amber-700" : "text-navy-900"}`}>{value}</p>
    </div>
  );
}
