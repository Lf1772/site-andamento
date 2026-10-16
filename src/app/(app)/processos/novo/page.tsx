import { ConfidentialNotice } from "@/components/ui";
import { config } from "@/lib/config";
import { AREAS, POSICOES } from "@/lib/processos";
import { NovoProcessoForm } from "./NovoProcessoForm";

export const metadata = { title: "Novo processo" };

export default function NovoProcessoPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Novo processo</h1>
        <p className="text-sm text-slate-500">Informe os dados do cliente, envie os documentos e receba um andamento pronto para revisão.</p>
      </div>
      <ConfidentialNotice />
      <NovoProcessoForm posicoes={[...POSICOES]} areas={[...AREAS]} maxMb={Math.round(config.maxFileBytes / 1024 / 1024)} />
    </div>
  );
}
