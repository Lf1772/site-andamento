#!/usr/bin/env bash
# Atualiza uma instalação feita com instalar.sh: baixa o código novo, aplica migrações,
# recompila e reinicia o serviço. Faz um backup antes de qualquer alteração.
#
# Uso (como root): sudo bash /srv/andamento/scripts/deploy/atualizar.sh
set -euo pipefail

APP_USER=andamento
APP_DIR=/srv/andamento
BACKUP_DIR=/srv/backups
BRANCH=${BRANCH:-main}

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mErro: %s\033[0m\n' "$*" >&2; exit 1; }
as_app() { sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && $*"; }

[ "$(id -u)" -eq 0 ] || fail "execute como root (sudo bash atualizar.sh)."
[ -f "$APP_DIR/.env" ] || fail "instalação não encontrada em $APP_DIR. Use instalar.sh."
[ -d "$APP_DIR/.git" ] || fail "$APP_DIR não é um repositório git."

log "Backup antes da atualização"
as_app "BACKUP_DIR='$BACKUP_DIR' ./scripts/backup.sh"

ANTERIOR=$(as_app "git rev-parse HEAD")
log "Baixando o código ($BRANCH)"
as_app "git fetch origin '$BRANCH' && git checkout -q '$BRANCH' && git pull --ff-only origin '$BRANCH'"
ATUAL=$(as_app "git rev-parse HEAD")
if [ "$ANTERIOR" = "$ATUAL" ]; then
  echo "Nenhuma alteração nova no código. Nada a fazer."
  exit 0
fi

log "Instalando dependências, aplicando migrações e compilando"
as_app "npm ci --no-audit --no-fund"
as_app "npm run db:migrate"
as_app "npm run build"

log "Reiniciando o serviço"
systemctl restart andamento
for _ in $(seq 1 30); do
  if curl -fs -o /dev/null "http://127.0.0.1:3000/login"; then OK=1; break; fi
  sleep 2
done
[ "${OK:-0}" -eq 1 ] || fail "o sistema não respondeu após a atualização. Veja: journalctl -u andamento -n 100
Para voltar à versão anterior: cd $APP_DIR && sudo -u $APP_USER git checkout $ANTERIOR && sudo -u $APP_USER npm ci && sudo -u $APP_USER npm run build && systemctl restart andamento
(o backup feito antes da atualização está em $BACKUP_DIR)"

echo
echo "Atualizado de ${ANTERIOR:0:7} para ${ATUAL:0:7}."
