import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config";

// Armazenamento privado com criptografia AES-256-GCM em repouso.
// Formato do arquivo: [12 bytes IV][16 bytes tag][conteúdo cifrado].

function getKey(): Buffer {
  const raw = process.env.STORAGE_ENCRYPTION_KEY;
  if (!raw) throw new Error("STORAGE_ENCRYPTION_KEY não configurada.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("STORAGE_ENCRYPTION_KEY deve ter 32 bytes em base64.");
  return key;
}

export function encrypt(data: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]);
}

export function decrypt(data: Buffer): Buffer {
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]);
}

function resolveKey(key: string): string {
  if (!/^[a-f0-9-]+(\/[a-f0-9-]+)*\.[a-z.]+$/.test(key)) throw new Error("Chave de armazenamento inválida.");
  const base = path.resolve(config.storageDir);
  const full = path.resolve(base, key);
  if (!full.startsWith(base + path.sep)) throw new Error("Chave de armazenamento inválida.");
  return full;
}

export async function putObject(key: string, data: Buffer): Promise<void> {
  const full = resolveKey(key);
  await fs.mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
  await fs.writeFile(full, encrypt(data), { mode: 0o600 });
}

export async function getObject(key: string): Promise<Buffer> {
  return decrypt(await fs.readFile(resolveKey(key)));
}

export async function deleteObject(key: string): Promise<void> {
  await fs.rm(resolveKey(key), { force: true });
}

export async function deletePrefix(prefix: string): Promise<void> {
  if (!/^[a-f0-9-]+(\/[a-f0-9-]+)*$/.test(prefix)) throw new Error("Prefixo inválido.");
  const base = path.resolve(config.storageDir);
  const full = path.resolve(base, prefix);
  if (!full.startsWith(base + path.sep)) throw new Error("Prefixo inválido.");
  await fs.rm(full, { recursive: true, force: true });
}
