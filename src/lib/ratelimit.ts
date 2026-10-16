import "server-only";

// Limitador simples em memória (adequado para instância única).
const buckets = new Map<string, { count: number; resetAt: number }>();

export function isRateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) return false;
  return b.count >= max;
}

export function registerHit(key: string, windowMs: number): void {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) buckets.set(key, { count: 1, resetAt: now + windowMs });
  else b.count++;
}

export function clearHits(key: string): void {
  buckets.delete(key);
}
