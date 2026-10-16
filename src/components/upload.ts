"use client";

export interface UploadResult {
  enviados: { id: string; nome: string; paginas: number | null }[];
  erros: string[];
}

/** Envia um arquivo por requisição, com acompanhamento de progresso. */
export function uploadFile(processoId: string, file: File, onProgress: (pct: number) => void): Promise<UploadResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("arquivos", file);
    xhr.open("POST", `/api/processos/${processoId}/documentos`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve({ enviados: data.enviados ?? [], erros: data.erros ?? [] });
        else resolve({ enviados: [], erros: data.erros?.length ? data.erros : [data.erro || `"${file.name}": falha no envio.`] });
      } catch {
        resolve({ enviados: [], erros: [`"${file.name}": falha no envio (resposta inválida do servidor).`] });
      }
    };
    xhr.onerror = () => resolve({ enviados: [], erros: [`"${file.name}": falha de conexão durante o envio.`] });
    xhr.send(form);
  });
}

export async function api<T = unknown>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    window.location.href = "/login";
  }
  if (!res.ok) throw new Error((data as { erro?: string }).erro || "Não foi possível concluir a operação.");
  return data as T;
}
