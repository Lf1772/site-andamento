import fs from "node:fs";
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
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (nome text PRIMARY KEY, aplicada_em timestamptz NOT NULL DEFAULT now())`);
  const dir = path.resolve("db/migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const { rows } = await client.query<{ nome: string }>("SELECT nome FROM schema_migrations");
  const applied = new Set(rows.map((r) => r.nome));
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    console.log(`Aplicando ${file}...`);
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (nome) VALUES ($1)", [file]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  }
  console.log("Migrações concluídas.");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
