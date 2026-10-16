// Aplica a política de retenção: exclui processos (e seus documentos) sem atividade há mais
// dias do que o configurado por cada escritório. Agende diariamente (ex.: cron).
import fs from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

try {
  process.loadEnvFile();
} catch {
  // sem arquivo .env: usa as variáveis de ambiente do sistema
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const storage = path.resolve(process.env.STORAGE_DIR || "./storage");
  const { rows } = await client.query<{ id: string; escritorio_id: string }>(
    `SELECT p.id, p.escritorio_id FROM processos p JOIN escritorios e ON e.id = p.escritorio_id
      WHERE e.retencao_dias IS NOT NULL AND p.updated_at < now() - make_interval(days => e.retencao_dias)`,
  );
  for (const p of rows) {
    await client.query("DELETE FROM processos WHERE id = $1", [p.id]);
    await fs.rm(path.join(storage, p.escritorio_id, p.id), { recursive: true, force: true });
    await client.query("INSERT INTO auditoria (escritorio_id, acao, entidade, entidade_id, detalhes) VALUES ($1,'processo_excluido_retencao','processo',$2,$3)", [
      p.escritorio_id,
      p.id,
      JSON.stringify({ motivo: "politica_de_retencao" }),
    ]);
  }
  // Sessões expiradas e registros de auditoria com mais de 5 anos.
  await client.query("DELETE FROM sessoes WHERE expires_at < now()");
  await client.query("DELETE FROM auditoria WHERE created_at < now() - interval '5 years'");
  console.log(`Retenção aplicada: ${rows.length} processo(s) excluído(s).`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
