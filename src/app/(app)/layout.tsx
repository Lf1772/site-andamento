import { Sidebar } from "@/components/Sidebar";
import { PAPEL_LABEL, requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-screen">
      <Sidebar user={{ nome: user.nome, papelLabel: PAPEL_LABEL[user.papel], escritorioNome: user.escritorioNome, isAdmin: user.papel === "admin" }} />
      <main className="lg:pl-64">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
