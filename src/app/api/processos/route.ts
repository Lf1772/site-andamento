import { z } from "zod/v4";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { HttpError, json, withUser } from "@/lib/http";
import { AREAS } from "@/lib/processos";

const Body = z.object({
  cliente_nome: z.string().trim().min(3).max(300),
  tratamento: z.enum(["sr", "sra", "neutro"]),
  numero_processo: z.string().trim().max(100).optional().default(""),
  parte_contraria: z.string().trim().max(300).optional().default(""),
  posicao_cliente: z.string().trim().min(2).max(100),
  area: z.enum(AREAS),
  observacoes_internas: z.string().max(10000).optional().default(""),
});

export const GET = withUser(async (req, { user }) => {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const rows = await query(
    `SELECT id, cliente_nome, numero_processo, posicao_cliente, area, ultima_analise_em, updated_at
       FROM processos WHERE escritorio_id = $1 AND ($2 = '' OR cliente_nome ILIKE '%' || $2 || '%' OR numero_processo ILIKE '%' || $2 || '%')
      ORDER BY updated_at DESC LIMIT 200`,
    [user.escritorioId, q],
  );
  return json({ processos: rows });
});

export const POST = withUser(async (req, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Verifique os dados: nome do cliente e posição processual são obrigatórios.");
  const d = parsed.data;
  const row = await queryOne<{ id: string }>(
    `INSERT INTO processos (escritorio_id, criado_por, cliente_nome, tratamento, numero_processo, parte_contraria, posicao_cliente, area, observacoes_internas)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [user.escritorioId, user.id, d.cliente_nome, d.tratamento, d.numero_processo || null, d.parte_contraria || null, d.posicao_cliente, d.area, d.observacoes_internas],
  );
  await audit({ escritorioId: user.escritorioId, usuarioId: user.id, acao: "processo_criado", entidade: "processo", entidadeId: row!.id, ip: await clientIp() });
  return json({ id: row!.id }, 201);
});
