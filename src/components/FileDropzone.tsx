"use client";

import { useRef, useState } from "react";
import { IconFile, IconTrash, IconUpload } from "./icons";

export interface PendingFile {
  file: File;
  progress: number;
  status: "aguardando" | "enviando" | "enviado" | "erro";
  erro?: string;
}

export function FileDropzone({
  files,
  onChange,
  disabled,
  maxMb,
}: {
  files: PendingFile[];
  onChange: (files: PendingFile[]) => void;
  disabled?: boolean;
  maxMb: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  function add(list: FileList | null) {
    if (!list) return;
    const novos: PendingFile[] = [];
    const recusados: string[] = [];
    for (const f of Array.from(list)) {
      if (!f.name.toLowerCase().endsWith(".pdf") && f.type !== "application/pdf") recusados.push(`"${f.name}" não é PDF`);
      else if (f.size > maxMb * 1024 * 1024) recusados.push(`"${f.name}" excede ${maxMb} MB`);
      else if (files.some((p) => p.file.name === f.name && p.file.size === f.size)) continue;
      else novos.push({ file: f, progress: 0, status: "aguardando" });
    }
    setAviso(recusados.length ? `Arquivos ignorados: ${recusados.join("; ")}.` : null);
    onChange([...files, ...novos]);
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (!disabled) add(e.dataTransfer.files);
        }}
        onClick={() => !disabled && input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
          drag ? "border-navy-500 bg-navy-50" : "border-slate-300 bg-slate-50 hover:border-navy-300 hover:bg-navy-50/50"
        } ${disabled ? "pointer-events-none opacity-60" : ""}`}
      >
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-white text-navy-700 shadow-sm">
          <IconUpload />
        </div>
        <p className="font-medium text-slate-800">Arraste os PDFs do processo aqui ou clique para selecionar</p>
        <p className="mt-1 text-xs text-slate-500">
          Vários arquivos ou um único PDF com todo o processo · documentos digitalizados passam por OCR · até {maxMb} MB por arquivo
        </p>
        <input ref={input} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      </div>
      {aviso && <p className="mt-2 text-sm text-red-700">{aviso}</p>}
      {files.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {files.map((f, i) => (
            <li key={`${f.file.name}-${i}`} className="flex items-center gap-3 px-3 py-2 text-sm">
              <IconFile className="h-4 w-4 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-slate-800">{f.file.name}</p>
                {f.status === "enviando" && (
                  <div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-100">
                    <div className="h-full bg-navy-600 transition-all" style={{ width: `${f.progress}%` }} />
                  </div>
                )}
                {f.erro && <p className="text-xs text-red-700">{f.erro}</p>}
              </div>
              <span className="shrink-0 text-xs text-slate-500">
                {f.status === "enviado" ? "Enviado" : f.status === "erro" ? "Erro" : f.status === "enviando" ? `${f.progress}%` : `${(f.file.size / 1024 / 1024).toFixed(1)} MB`}
              </span>
              {f.status === "aguardando" && !disabled && (
                <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600" aria-label={`Remover ${f.file.name}`}>
                  <IconTrash />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Envia os arquivos pendentes sequencialmente, atualizando o estado de cada um. */
export async function uploadAll(
  processoId: string,
  files: PendingFile[],
  setFiles: (f: PendingFile[]) => void,
  uploadFile: (id: string, f: File, p: (n: number) => void) => Promise<{ enviados: unknown[]; erros: string[] }>,
): Promise<{ ok: number; erros: string[] }> {
  const state = files.map((f) => ({ ...f }));
  let ok = 0;
  const erros: string[] = [];
  for (let i = 0; i < state.length; i++) {
    if (state[i].status === "enviado") continue;
    state[i] = { ...state[i], status: "enviando", progress: 0 };
    setFiles([...state]);
    const r = await uploadFile(processoId, state[i].file, (p) => {
      state[i] = { ...state[i], progress: p };
      setFiles([...state]);
    });
    if (r.enviados.length) {
      ok++;
      state[i] = { ...state[i], status: "enviado", progress: 100 };
    } else {
      state[i] = { ...state[i], status: "erro", erro: r.erros.join(" ") };
      erros.push(...r.erros);
    }
    setFiles([...state]);
  }
  return { ok, erros };
}
