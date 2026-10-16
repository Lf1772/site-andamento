import bcrypt from "bcryptjs";
import { Client } from "pg";

try {
  process.loadEnvFile();
} catch {
  // sem arquivo .env: usa as variáveis de ambiente do sistema
}

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const senha = process.env.SEED_ADMIN_SENHA;
  if (!email || !senha || senha.length < 12) {
    throw new Error("Defina SEED_ADMIN_EMAIL e SEED_ADMIN_SENHA (mínimo de 12 caracteres).");
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const existing = await client.query("SELECT 1 FROM usuarios WHERE email = $1", [email]);
  if (existing.rowCount) {
    console.log("Usuário administrador já existe; nada a fazer.");
    await client.end();
    return;
  }
  const esc = await client.query<{ id: string }>(
    "INSERT INTO escritorios (nome) VALUES ($1) RETURNING id",
    [process.env.SEED_ESCRITORIO_NOME || "Escritório de Advocacia"],
  );
  await client.query(
    "INSERT INTO usuarios (escritorio_id, nome, email, senha_hash, papel) VALUES ($1, $2, $3, $4, 'admin')",
    [esc.rows[0].id, process.env.SEED_ADMIN_NOME || "Administrador", email, await bcrypt.hash(senha, 12)],
  );
  console.log(`Escritório e administrador ${email} criados.`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
