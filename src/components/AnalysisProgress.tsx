"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const STEPS = [
  { key: "extraindo", label: "Leitura dos PDFs e OCR" },
  { key: "analisando", label: "Análise jurídica por IA" },
  { key: "concluida", label: "Andamento pronto para revisão" },
];

export function AnalysisProgress({ analiseId, processoId }: { analiseId: string; processoId: string }) {
  const router = useRouter();
  const [state, setState] = useState<{ status: string; progresso: string | null; erro: string | null }>({ status: "na_fila", progresso: null, erro: null });

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const res = await fetch(`/api/analises/${analiseId}`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (!active) return;
          setState(data);
          if (data.status === "concluida") {
            router.push(`/processos/${processoId}/revisao/${analiseId}`);
            return;
          }
          if (data.status === "erro") {
            router.refresh();
            return;
          }
        }
      } catch {
        /* tenta novamente */
      }
      timer = setTimeout(poll, 2500);
    }
    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [analiseId, processoId, router]);

  const idx = state.status === "na_fila" ? -1 : STEPS.findIndex((s) => s.key === state.status || (state.status === "redigindo" && s.key === "analisando"));

  return (
    <div className="card border-navy-200 p-5">
      <div className="flex items-center gap-3">
        <span className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-navy-400 opacity-60" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-navy-600" />
        </span>
        <p className="font-medium text-navy-900">Processando documentos</p>
      </div>
      <ol className="mt-4 space-y-2">
        {STEPS.map((s, i) => (
          <li key={s.key} className="flex items-center gap-3 text-sm">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                i < idx ? "bg-emerald-100 text-emerald-700" : i === idx ? "bg-navy-700 text-white" : "bg-slate-100 text-slate-400"
              }`}
            >
              {i < idx ? "✓" : i + 1}
            </span>
            <span className={i === idx ? "font-medium text-slate-900" : "text-slate-500"}>{s.label}</span>
          </li>
        ))}
      </ol>
      <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600" aria-live="polite">
        {state.progresso || "Aguardando início…"}
      </p>
      <p className="mt-2 text-xs text-slate-500">Processos extensos podem levar alguns minutos. Você pode sair desta página; a análise continua em segundo plano.</p>
    </div>
  );
}
