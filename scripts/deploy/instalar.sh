#!/usr/bin/env bash
# Instalação completa em um servidor Ubuntu 22.04/24.04 limpo.
#
# Uso (como root):
#   curl -fsSLO https://raw.githubusercontent.com/<usuario>/site-andamento/main/scripts/deploy/instalar.sh   # ou copie o arquivo
#   sudo bash instalar.sh
#
# Variáveis opcionais (o script pergunta o que faltar):
#   DOMINIO           domínio já apontado para o IP do servidor (ex.: andamentos.escritorio.com.br)
#   ESCRITORIO_NOME   nome do escritório
#   ADMIN_NOME        nome do administrador inicial
#   ADMIN_EMAIL       e-mail do administrador inicial
#   ADMIN_SENHA       senha do administrador (se vazia, é gerada e exibida ao final)
#   ANTHROPIC_API_KEY chave da API da Anthropic
#   REPO_URL          repositório git (padrão: https://github.com/Lf1772/site-andamento.git)
#   BRANCH            branch a instalar (padrão: main)
#
# O script pode ser executado novamente com segurança: ele não sobrescreve o .env existente
# (que contém a chave de criptografia dos documentos) nem recria o banco de dados.
set -euo pipefail

APP_USER=andamento
APP_DIR=/srv/andamento
BACKUP_DIR=/srv/backups
REPO_URL=${REPO_URL:-https://github.com/Lf1772/site-andamento.git}
BRANCH=${BRANCH:-main}
PORT=3000

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mErro: %s\033[0m\n' "$*" >&2; exit 1; }
ask() { # ask VAR "Pergunta" [secreto] — pergunta apenas se a variável não foi definida
  local var=$1 prompt=$2 secret=${3:-}
  if [ -z "${!var+x}" ]; then
    if [ -n "$secret" ]; then read -r -s -p "$prompt: " "${var?}" || true; echo; else read -r -p "$prompt: " "${var?}" || true; fi
  fi
}
as_app() { sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && $*"; }
rand_hex() { openssl rand -hex "$1"; }

# ---------------------------------------------------------------- verificações
[ "$(id -u)" -eq 0 ] || fail "execute como root (sudo bash instalar.sh)."
grep -qi ubuntu /etc/os-release || fail "este script foi feito para Ubuntu 22.04 ou 24.04."
command -v systemctl >/dev/null || fail "systemd não encontrado."

PRIMEIRA_INSTALACAO=1
[ -f "$APP_DIR/.env" ] && PRIMEIRA_INSTALACAO=0
# O administrador é criado enquanto não houver nenhum usuário (inclusive se uma execução anterior falhou no meio).
PRECISA_ADMIN=1
if [ "$PRIMEIRA_INSTALACAO" -eq 0 ] && command -v psql >/dev/null; then
  N=$(sudo -u postgres psql -d andamento -tAc "SELECT count(*) FROM usuarios" 2>/dev/null || echo 0)
  [ "${N:-0}" -gt 0 ] && PRECISA_ADMIN=0
fi

ask DOMINIO "Domínio do site (ex.: andamentos.escritorio.com.br; deixe vazio para acessar só pelo IP, sem HTTPS)"
if [ "$PRIMEIRA_INSTALACAO" -eq 1 ]; then
  ask ANTHROPIC_API_KEY "Chave da API da Anthropic (sk-ant-...)" secreto
  [ -n "${ANTHROPIC_API_KEY:-}" ] || fail "a chave da API da Anthropic é obrigatória."
fi
if [ "$PRECISA_ADMIN" -eq 1 ]; then
  ask ESCRITORIO_NOME "Nome do escritório"
  ask ADMIN_NOME "Nome do administrador"
  ask ADMIN_EMAIL "E-mail do administrador"
  [ -n "${ADMIN_EMAIL:-}" ] || fail "o e-mail do administrador é obrigatório."
  if [ -z "${ADMIN_SENHA:-}" ]; then
    ADMIN_SENHA=$(rand_hex 9)
    SENHA_GERADA=1
  fi
  [ "${#ADMIN_SENHA}" -ge 12 ] || fail "a senha do administrador deve ter ao menos 12 caracteres."
fi

# ---------------------------------------------------------------- pacotes
log "Instalando pacotes do sistema"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q ca-certificates curl gnupg git openssl ufw postgresql debian-keyring debian-archive-keyring apt-transport-https sudo cron

NODE_MAJOR=$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || true)
if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 20 ]; then
  log "Instalando Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -q nodejs
fi

if [ -n "$DOMINIO" ] && ! command -v caddy >/dev/null; then
  log "Instalando Caddy (HTTPS automático)"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get install -y -q caddy
fi

# ---------------------------------------------------------------- usuário e código
log "Preparando usuário e diretórios"
id "$APP_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash "$APP_USER"
mkdir -p "$APP_DIR" "$BACKUP_DIR"
chown "$APP_USER:$APP_USER" "$APP_DIR" "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

if [ -d "$APP_DIR/.git" ]; then
  log "Atualizando o código ($BRANCH)"
  as_app "git fetch origin '$BRANCH' && git checkout -q '$BRANCH' && git pull --ff-only origin '$BRANCH'"
elif [ -f "$APP_DIR/package.json" ]; then
  log "Código já presente em $APP_DIR (sem git); usando-o como está"
else
  log "Baixando o código de $REPO_URL"
  echo "Se o repositório for privado, informe seu usuário do GitHub e, como senha, um token de acesso pessoal."
  sudo -u "$APP_USER" -H git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

# ---------------------------------------------------------------- banco e .env
systemctl enable --now postgresql >/dev/null 2>&1 || true
if [ "$PRIMEIRA_INSTALACAO" -eq 1 ]; then
  log "Criando banco de dados e arquivo de configuração"
  DB_SENHA=$(rand_hex 24)
  if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='andamento'" | grep -q 1; then
    sudo -u postgres psql -q -c "ALTER USER andamento WITH PASSWORD '$DB_SENHA';"
  else
    sudo -u postgres psql -q -c "CREATE USER andamento WITH PASSWORD '$DB_SENHA';"
  fi
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='andamento'" | grep -q 1 \
    || sudo -u postgres createdb -O andamento andamento

  umask 077
  cat > "$APP_DIR/.env" <<EOF
DATABASE_URL=postgres://andamento:${DB_SENHA}@localhost:5432/andamento
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
AI_MODEL=claude-opus-5-5
AI_FALLBACKS=default
STORAGE_DIR=${APP_DIR}/storage
STORAGE_ENCRYPTION_KEY=$(openssl rand -base64 32)
MAX_FILE_MB=200
MAX_PAGES_PER_DOCUMENT=3000
MAX_TOKENS_PER_ANALYSIS=1500000
SINGLE_PASS_TOKEN_LIMIT=300000
MAX_OCR_PAGES_PER_DOCUMENT=400
SESSION_HOURS=12
EOF
  umask 022
  chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  install -d -m 700 -o "$APP_USER" -g "$APP_USER" "$APP_DIR/storage"
else
  log "Arquivo .env existente mantido (a chave de criptografia não foi alterada)"
fi

# ---------------------------------------------------------------- build
log "Instalando dependências e compilando"
as_app "npm ci --no-audit --no-fund"
as_app "npm run db:migrate"
if [ "$PRECISA_ADMIN" -eq 1 ]; then
  sudo -u "$APP_USER" -H env -C "$APP_DIR" \
    SEED_ESCRITORIO_NOME="${ESCRITORIO_NOME:-Escritório de Advocacia}" \
    SEED_ADMIN_NOME="${ADMIN_NOME:-Administrador}" \
    SEED_ADMIN_EMAIL="$ADMIN_EMAIL" \
    SEED_ADMIN_SENHA="$ADMIN_SENHA" \
    npm run db:seed
fi
as_app "npm run build"

# ---------------------------------------------------------------- serviço
log "Configurando o serviço do sistema"
# Com domínio, o Node só escuta localmente e o Caddy publica com HTTPS.
# Sem domínio (modo de teste), o Node é exposto diretamente e o cookie de sessão é aceito sem HTTPS.
if [ -n "$DOMINIO" ]; then
  BIND_HOST=127.0.0.1
  sed -i '/^COOKIE_SECURE=/d' "$APP_DIR/.env"
else
  BIND_HOST=0.0.0.0
  grep -q '^COOKIE_SECURE=' "$APP_DIR/.env" || echo 'COOKIE_SECURE=false' >> "$APP_DIR/.env"
fi
chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"
cat > /etc/systemd/system/andamento.service <<EOF
[Unit]
Description=Andamento Processual
After=network.target postgresql.service
Requires=postgresql.service

[Service]
User=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
ExecStart=${APP_DIR}/node_modules/.bin/next start -H ${BIND_HOST} -p ${PORT}
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable andamento >/dev/null
systemctl restart andamento

if [ -n "$DOMINIO" ]; then
  log "Configurando HTTPS para $DOMINIO"
  cat > /etc/caddy/Caddyfile <<EOF
${DOMINIO} {
    encode gzip
    reverse_proxy 127.0.0.1:${PORT}
}
EOF
  systemctl enable caddy >/dev/null
  systemctl reload caddy || systemctl restart caddy
fi

# ---------------------------------------------------------------- firewall e rotinas
log "Ativando firewall e rotinas diárias (backup e retenção)"
ufw allow OpenSSH >/dev/null
if [ -n "$DOMINIO" ]; then
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
else
  ufw allow ${PORT}/tcp >/dev/null
fi
ufw --force enable >/dev/null

CRON_TMP=$(mktemp)
crontab -u "$APP_USER" -l 2>/dev/null | grep -v '# andamento-' > "$CRON_TMP" || true
cat >> "$CRON_TMP" <<EOF
45 2 * * * cd ${APP_DIR} && BACKUP_DIR=${BACKUP_DIR} ./scripts/backup.sh >> ${BACKUP_DIR}/backup.log 2>&1 # andamento-backup
15 3 * * * cd ${APP_DIR} && npm run retencao >> ${BACKUP_DIR}/retencao.log 2>&1 # andamento-retencao
EOF
crontab -u "$APP_USER" "$CRON_TMP"
rm -f "$CRON_TMP"
systemctl enable --now cron >/dev/null 2>&1 || true

# ---------------------------------------------------------------- verificação
log "Verificando se o sistema respondeu"
for _ in $(seq 1 30); do
  if curl -fs -o /dev/null "http://127.0.0.1:${PORT}/login"; then OK=1; break; fi
  sleep 2
done
[ "${OK:-0}" -eq 1 ] || fail "o sistema não respondeu. Veja os registros com: journalctl -u andamento -n 100"

IP=$(curl -fs4 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
echo
echo "================================================================"
echo " Instalação concluída."
if [ -n "$DOMINIO" ]; then
  echo " Acesse: https://${DOMINIO}"
  echo " (o domínio precisa apontar para ${IP} para o certificado HTTPS ser emitido)"
else
  echo " Acesse: http://${IP}:${PORT}  (sem HTTPS: use apenas para teste)"
fi
if [ "$PRECISA_ADMIN" -eq 1 ]; then
  echo
  echo " Administrador: ${ADMIN_EMAIL}"
  if [ "${SENHA_GERADA:-0}" -eq 1 ]; then echo " Senha gerada:  ${ADMIN_SENHA}   (anote e troque depois do primeiro acesso)"; fi
fi
if [ "$PRIMEIRA_INSTALACAO" -eq 1 ]; then
  echo
  echo " IMPORTANTE: copie a STORAGE_ENCRYPTION_KEY de ${APP_DIR}/.env para um local"
  echo " seguro fora do servidor. Sem ela, os documentos não podem ser recuperados."
fi
echo
echo " Backups diários em ${BACKUP_DIR} (copie-os também para fora do servidor)."
echo " Para atualizar o sistema no futuro: sudo bash ${APP_DIR}/scripts/deploy/atualizar.sh"
echo "================================================================"
