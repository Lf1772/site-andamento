#!/usr/bin/env bash
# Backup do banco e dos documentos (que já estão criptografados em repouso).
# Uso: DATABASE_URL=... STORAGE_DIR=./storage BACKUP_DIR=./backups ./scripts/backup.sh
# Restauração: psql "$DATABASE_URL" < banco.sql  &&  tar -xzf documentos.tar.gz -C "$STORAGE_DIR"
# Guarde a STORAGE_ENCRYPTION_KEY separadamente: sem ela os documentos não podem ser recuperados.
set -euo pipefail
STAMP=$(date +%Y%m%d-%H%M%S)
DEST="${BACKUP_DIR:-./backups}/$STAMP"
mkdir -p "$DEST"
chmod 700 "$DEST"
pg_dump --no-owner --no-privileges "$DATABASE_URL" > "$DEST/banco.sql"
tar -czf "$DEST/documentos.tar.gz" -C "${STORAGE_DIR:-./storage}" .
# Retém os últimos 30 backups
ls -1dt "${BACKUP_DIR:-./backups}"/*/ 2>/dev/null | tail -n +31 | xargs -r rm -rf
echo "Backup concluído em $DEST"
