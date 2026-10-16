import { notFound } from "next/navigation";
import { can, PAPEL_LABEL, requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { UsuariosClient } from "./UsuariosClient";

export const metadata = { title: "Usuários" };

export default async function UsuariosPage() {
  const user = await requireUser();
  if (!can.gerenciarUsuarios(user)) notFound();
  const usuarios = await query<{ id: string; nome: string; email: string; papel: keyof typeof PAPEL_LABEL; ativo: boolean; ultimo_login: Date | null }>(
    "SELECT id, nome, email, papel, ativo, ultimo_login FROM usuarios WHERE escritorio_id = $1 ORDER BY ativo DESC, nome",
    [user.escritorioId],
  );
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Usuários</h1>
        <p className="text-sm text-slate-500">Somente usuários cadastrados aqui acessam os processos do escritório.</p>
      </div>
      <UsuariosClient
        meuId={user.id}
        usuarios={usuarios.map((u) => ({ ...u, ultimo_login: u.ultimo_login?.toISOString() ?? null }))}
      />
      <div className="card p-5 text-sm text-slate-600">
        <p className="font-medium text-slate-800">Permissões por papel</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><strong>Administrador:</strong> todas as ações, gestão de usuários, auditoria e configurações de retenção.</li>
          <li><strong>Advogado(a):</strong> cadastrar, analisar, revisar e aprovar andamentos; excluir processos e documentos.</li>
          <li><strong>Estagiário(a):</strong> cadastrar, enviar documentos, analisar e revisar; não pode excluir processos ou documentos.</li>
        </ul>
      </div>
    </div>
  );
}
