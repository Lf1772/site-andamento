import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { isUuid } from "@/lib/http";
import { getAnaliseForUser, getProcessoForUser } from "@/lib/processos";
import { ReviewClient } from "./ReviewClient";

export const metadata = { title: "Revisão do andamento" };

export default async function RevisaoPage({ params }: { params: Promise<{ id: string; analiseId: string }> }) {
  const user = await requireUser();
  const { id, analiseId } = await params;
  if (!isUuid(id) || !isUuid(analiseId)) notFound();
  const p = await getProcessoForUser(user, id).catch(() => null);
  const a = await getAnaliseForUser(user, analiseId).catch(() => null);
  if (!p || !a || a.processo_id !== p.id) notFound();
  if (a.status !== "concluida" || !a.resultado || !a.campos) {
    return (
      <div className="space-y-4">
        <Link href={`/processos/${p.id}`} className="text-sm text-slate-500">← Voltar ao processo</Link>
        <p className="card p-5 text-sm text-slate-600">Esta análise ainda não está disponível para revisão.</p>
      </div>
    );
  }

  const docIds = Object.values(a.resultado._meta?.documentos ?? {});
  const docs = docIds.length
    ? await query<{ id: string; nome_original: string }>("SELECT id, nome_original FROM documentos WHERE id = ANY($1::uuid[])", [docIds])
    : [];
  const nomes = Object.fromEntries(
    Object.entries(a.resultado._meta?.documentos ?? {}).map(([ref, did]) => [ref, { id: did, nome: docs.find((d) => d.id === did)?.nome_original ?? "(documento excluído)" }]),
  );
  const versoes = await query<{ id: string; texto: string; variante: string; origem: string; created_at: Date; autor: string | null }>(
    `SELECT v.id, v.texto, v.variante, v.origem, v.created_at, u.nome AS autor
       FROM andamento_versoes v LEFT JOIN usuarios u ON u.id = v.criado_por WHERE v.analise_id = $1 ORDER BY v.created_at DESC LIMIT 30`,
    [a.id],
  );
  const aprovador = a.aprovado_por ? (await query<{ nome: string }>("SELECT nome FROM usuarios WHERE id = $1", [a.aprovado_por]))[0]?.nome : null;

  return (
    <ReviewClient
      processo={{ id: p.id, cliente_nome: p.cliente_nome, posicao_cliente: p.posicao_cliente }}
      analise={{
        id: a.id,
        tipo: a.tipo,
        created_at: a.created_at.toISOString(),
        campos: a.campos,
        andamento: a.andamento ?? "",
        variante: a.variante,
        formalidade: a.formalidade,
        aprovado_em: a.aprovado_em?.toISOString() ?? null,
        aprovador: aprovador ?? null,
        salvo_no_historico: a.salvo_no_historico,
        resultado: a.resultado,
        custo: Number(a.custo_estimado_usd),
        modelo: a.modelo,
      }}
      documentos={nomes}
      versoes={versoes.map((v) => ({ ...v, created_at: v.created_at.toISOString() }))}
    />
  );
}
