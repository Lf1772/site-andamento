import "server-only";
import { query } from "./db";

export async function audit(params: {
  escritorioId: string | null;
  usuarioId: string | null;
  acao: string;
  entidade?: string;
  entidadeId?: string;
  detalhes?: Record<string, unknown>;
  ip?: string | null;
}): Promise<void> {
  try {
    await query(
      "INSERT INTO auditoria (escritorio_id, usuario_id, acao, entidade, entidade_id, detalhes, ip) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [
        params.escritorioId,
        params.usuarioId,
        params.acao,
        params.entidade ?? null,
        params.entidadeId ?? null,
        params.detalhes ? JSON.stringify(params.detalhes) : null,
        params.ip ?? null,
      ],
    );
  } catch (err) {
    console.error("Falha ao registrar auditoria", err);
  }
}
