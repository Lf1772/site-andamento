export function formatDate(d: Date | string | null | undefined, withTime = false): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export function ConfidentialNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex gap-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 ${compact ? "px-3 py-2 text-xs" : "px-4 py-3 text-sm"}`}>
      <span aria-hidden>🔒</span>
      <p>
        <strong>Material confidencial.</strong> Os documentos enviados contêm dados pessoais e informações protegidas pelo sigilo profissional.
        Envie apenas processos que você está autorizado(a) a tratar. Os arquivos são armazenados de forma criptografada, com acesso restrito ao escritório, e
        não são utilizados para treinar modelos de inteligência artificial.
      </p>
    </div>
  );
}

const STATUS: Record<string, { label: string; cls: string }> = {
  na_fila: { label: "Na fila", cls: "bg-slate-100 text-slate-700" },
  extraindo: { label: "Lendo arquivos", cls: "bg-blue-50 text-blue-700" },
  analisando: { label: "Analisando", cls: "bg-blue-50 text-blue-700" },
  redigindo: { label: "Redigindo", cls: "bg-blue-50 text-blue-700" },
  concluida: { label: "Aguardando revisão", cls: "bg-amber-50 text-amber-800" },
  aprovada: { label: "Revisado", cls: "bg-emerald-50 text-emerald-700" },
  erro: { label: "Erro", cls: "bg-red-50 text-red-700" },
};

export function AnaliseStatusBadge({ status, aprovado }: { status: string; aprovado?: boolean }) {
  const s = STATUS[status === "concluida" && aprovado ? "aprovada" : status] ?? STATUS.na_fila;
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <p className="font-medium text-slate-800">{title}</p>
      {children && <div className="mt-2 text-sm text-slate-500">{children}</div>}
    </div>
  );
}
