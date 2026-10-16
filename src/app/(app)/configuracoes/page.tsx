import { notFound } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { ConfiguracoesClient } from "./ConfiguracoesClient";

export const metadata = { title: "Configurações" };

export default async function ConfiguracoesPage() {
  const user = await requireUser();
  if (!can.configurarEscritorio(user)) notFound();
  const e = (await queryOne<{ nome: string; assinatura: string | null; retencao_dias: number | null }>(
    "SELECT nome, assinatura, retencao_dias FROM escritorios WHERE id = $1",
    [user.escritorioId],
  ))!;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Configurações</h1>
        <p className="text-sm text-slate-500">Dados do escritório e política de retenção de dados.</p>
      </div>
      <ConfiguracoesClient inicial={{ nome: e.nome, assinatura: e.assinatura ?? "", retencao_dias: e.retencao_dias }} />
    </div>
  );
}
