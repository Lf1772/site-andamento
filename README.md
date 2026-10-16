# Andamento Processual

Plataforma interna para escritórios de advocacia: o advogado ou estagiário envia os PDFs de um processo judicial e recebe, em poucos minutos, um andamento formal, curto e compreensível para o cliente, **sempre revisado por uma pessoa antes do envio**.

Foco na Justiça do Trabalho, mas funciona para processos cíveis, previdenciários, de família, consumidor, tributários e outros.

## Funcionalidades

- **Upload de PDFs**: vários arquivos, um único PDF com todo o processo, documentos com centenas de páginas e envio posterior de novos documentos.
- **Extração de texto + OCR**: o texto dos PDFs digitais é extraído página a página. As páginas digitalizadas (sem texto) são transcritas pelo modelo de IA, que lê PDFs visualmente.
- **Análise por IA com fundamentação**: cronologia, decisões (com status: proferida, definitiva, modificada ou incerta), pedidos reconhecidos e negados **do ponto de vista do cliente**, recursos, fase, instância, valores, prazos e próxima etapa. Cada informação traz o documento, a página e o trecho que a sustentam.
- **Alertas internos**: contradições, incertezas (por exemplo, recurso cujo julgamento não pôde ser confirmado), páginas ilegíveis e documentos não lidos. Aparecem só na área de revisão.
- **Tela de revisão**: todos os campos são editáveis. O texto pode ser regenerado em quatro variantes (padrão, resumido, detalhado, linguagem ainda mais simples), em três níveis de formalidade e com instruções livres.
- **Revisão humana obrigatória**: os botões *Copiar andamento* e *Baixar em PDF* só ficam liberados depois da aprovação, e qualquer alteração exige nova aprovação. A cópia leva **apenas** o texto ao cliente.
- **Histórico**: cada processo tem página própria com o último andamento, o histórico de análises, as versões do texto, os documentos e as observações internas.
- **Atualização de processos**: novos documentos são comparados com a análise e o andamento anteriores. O texto foca no que mudou, sem repetir todo o histórico.
- **Segurança**: autenticação obrigatória, dados separados por escritório, papéis (administrador, advogado e estagiário), documentos criptografados (AES-256-GCM) em armazenamento privado, downloads só com sessão autenticada, auditoria, retenção configurável e rotina de backup.

## Arquitetura

| Camada | Tecnologia |
|---|---|
| Interface e backend | Next.js 16 (App Router, React 19, TypeScript) e Tailwind CSS 4 |
| Banco de dados | PostgreSQL (driver `pg`, migrações SQL em `db/migrations`) |
| Armazenamento | Diretório privado no servidor, com arquivos cifrados em AES-256-GCM (`src/lib/storage.ts`) |
| IA | SDK oficial da Anthropic (`@anthropic-ai/sdk`), modelo `claude-opus-5-5`, saídas estruturadas validadas com Zod |
| PDF | `unpdf` para extrair texto, `pdf-lib` para separar páginas para OCR e gerar o PDF do andamento |

### Fluxo da análise (`src/lib/jobs.ts`)

1. **Extração**: cada PDF é lido página a página. Páginas com pouco ou nenhum texto vão para OCR em lotes. O texto extraído é guardado cifrado.
2. **Análise**:
   - *Volume pequeno*: leitura integral em uma única chamada.
   - *Volume grande* (acima de `SINGLE_PASS_TOKEN_LIMIT`): o material é dividido em partes que respeitam a ordem e o limite das páginas. Cada parte vira uma lista de eventos com citações, e a consolidação final reconstrói a cronologia.
   - *Atualização de processo extenso*: só os documentos novos são lidos integralmente, e o histórico entra pela análise anterior.
3. **Rascunho**: os campos de revisão e o andamento são salvos para revisão humana.

A análise roda em segundo plano (`after()` do Next.js). A interface consulta o andamento e mostra o progresso. Análises interrompidas (por exemplo, por reinício do servidor) são marcadas como erro depois de 45 minutos.

As regras de confiabilidade jurídica e de linguagem ficam em `src/lib/ai/prompts.ts`.

### Controle de custos e limites

- `MAX_FILE_MB` e `MAX_PAGES_PER_DOCUMENT` limitam cada upload.
- `MAX_OCR_PAGES_PER_DOCUMENT` limita o OCR.
- `MAX_TOKENS_PER_ANALYSIS` recusa análises acima do teto estimado.
- O consumo de tokens e o custo estimado de cada análise ficam registrados e aparecem no rodapé da revisão.
- O prompt do sistema usa cache de prompt.

## Instalação

Requisitos: Node.js 20.12 ou superior, PostgreSQL 14 ou superior e uma chave da API da Anthropic.

```bash
npm install
cp .env.example .env          # preencha as variáveis
openssl rand -base64 32       # use como STORAGE_ENCRYPTION_KEY
npm run db:migrate            # cria as tabelas
npm run db:seed               # cria o escritório e o administrador definidos em SEED_*
npm run build && npm start    # http://localhost:3000
```

Para desenvolvimento: `npm run dev`.

### Produção (instalação automática)

Em um servidor **Ubuntu 22.04 ou 24.04** novo (VPS com pelo menos 2 GB de RAM, de preferência na região de São Paulo), com o domínio já apontando para o IP do servidor:

```bash
git clone https://github.com/Lf1772/site-andamento.git /tmp/site-andamento   # repositório privado: use um token do GitHub como senha
sudo bash /tmp/site-andamento/scripts/deploy/instalar.sh
```

O script pergunta o domínio, o nome do escritório, o administrador e a chave da API da Anthropic. Depois ele:

- instala Node.js 22, PostgreSQL e Caddy (HTTPS automático com Let's Encrypt);
- cria o usuário de sistema `andamento`, o código em `/srv/andamento` e o banco com senha aleatória;
- gera o `.env` com a chave de criptografia dos documentos (o arquivo nunca é sobrescrito em execuções seguintes);
- aplica as migrações, cria o administrador (gera uma senha se nenhuma for informada) e compila;
- configura o serviço `systemd`, o HTTPS, o firewall e as rotinas diárias de backup (`/srv/backups`) e retenção.

Para instalar sem perguntas, defina as variáveis antes: `DOMINIO`, `ESCRITORIO_NOME`, `ADMIN_NOME`, `ADMIN_EMAIL`, `ADMIN_SENHA` e `ANTHROPIC_API_KEY`. Se `DOMINIO` ficar vazio, o sistema é publicado pelo IP na porta 3000, sem HTTPS; use isso só para testes.

Para atualizar depois (faz backup antes, recompila e reinicia):

```bash
sudo bash /srv/andamento/scripts/deploy/atualizar.sh
```

Cuidados:

- Copie a `STORAGE_ENCRYPTION_KEY` de `/srv/andamento/.env` para um local seguro fora do servidor. Sem ela, os documentos não podem ser recuperados.
- Copie os backups de `/srv/backups` periodicamente para fora do servidor.
- O sistema roda como processo Node de instância única: a análise em segundo plano e o limitador de tentativas de login ficam em memória.
- Registros do sistema: `journalctl -u andamento -n 100`.
- Restauração: `psql "$DATABASE_URL" < banco.sql` e `tar -xzf documentos.tar.gz -C "$STORAGE_DIR"`.

## Segurança e LGPD

- **Acesso**: só usuários cadastrados pelo administrador entram. Senhas usam bcrypt. As sessões ficam no banco com token aleatório, guardado como hash, em cookie `HttpOnly`/`SameSite`. Há limite de tentativas de login.
- **Separação**: toda consulta é filtrada pelo escritório do usuário. Um usuário de outro escritório recebe "não encontrado".
- **Permissões**: estagiários não excluem processos nem documentos. Usuários, auditoria e configurações são exclusivos do administrador.
- **Proteções web**: verificação de origem nas requisições que alteram dados (CSRF), cabeçalhos de segurança (CSP, HSTS, X-Frame-Options e outros) e nenhuma URL pública para arquivos.
- **Auditoria**: logins, uploads, downloads, análises, edições, aprovações, cópias, exclusões e mudanças de usuários ficam registrados.
- **Retenção**: exclusão automática de processos inativos, configurável pelo administrador, além de exclusão manual que remove processo, análises e arquivos.
- **IA**: a chave da API fica só no servidor. Pelos termos comerciais da API da Anthropic, os dados enviados não são usados para treinar modelos. A interface avisa que o material é confidencial e pede a declaração de autorização antes do envio.
- **Sigilo interno**: as observações internas orientam a análise, mas o modelo é instruído a nunca reproduzi-las. Alertas e citações não entram no texto copiado nem no PDF.

## Scripts

| Comando | Descrição |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm start` | Build e servidor de produção |
| `npm run lint` | Checagem de tipos (TypeScript) |
| `npm test` | Testes (criptografia, divisão de processos extensos, PDF e schema da análise) |
| `npm run db:migrate` | Aplica as migrações |
| `npm run db:seed` | Cria o escritório e o administrador iniciais |
| `npm run retencao` | Aplica a política de retenção |
| `scripts/backup.sh` | Backup do banco e dos documentos |
| `scripts/deploy/instalar.sh` | Instalação completa em servidor Ubuntu |
| `scripts/deploy/atualizar.sh` | Atualização de uma instalação existente |
