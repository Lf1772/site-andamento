-- Estrutura inicial da plataforma de andamentos processuais
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE escritorios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  -- Dias após a última atividade em que o processo e seus documentos são excluídos automaticamente (NULL = sem exclusão automática)
  retencao_dias integer CHECK (retencao_dias IS NULL OR retencao_dias >= 30),
  assinatura text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escritorio_id uuid NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
  nome text NOT NULL,
  email text NOT NULL UNIQUE,
  senha_hash text NOT NULL,
  papel text NOT NULL CHECK (papel IN ('admin', 'advogado', 'estagiario')),
  ativo boolean NOT NULL DEFAULT true,
  ultimo_login timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessoes_usuario_idx ON sessoes(usuario_id);

CREATE TABLE processos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escritorio_id uuid NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
  criado_por uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  cliente_nome text NOT NULL,
  tratamento text NOT NULL DEFAULT 'neutro' CHECK (tratamento IN ('sr', 'sra', 'neutro')),
  numero_processo text,
  parte_contraria text,
  posicao_cliente text NOT NULL,
  area text NOT NULL DEFAULT 'trabalhista',
  observacoes_internas text NOT NULL DEFAULT '',
  ultima_analise_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX processos_escritorio_idx ON processos(escritorio_id, updated_at DESC);

CREATE TABLE documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id uuid NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  escritorio_id uuid NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
  enviado_por uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  nome_original text NOT NULL,
  tamanho_bytes bigint NOT NULL,
  sha256 text NOT NULL,
  storage_key text NOT NULL,
  texto_key text,
  num_paginas integer,
  paginas_ocr integer NOT NULL DEFAULT 0,
  paginas_sem_texto integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'extraindo', 'extraido', 'erro')),
  erro text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX documentos_processo_idx ON documentos(processo_id, created_at);
CREATE UNIQUE INDEX documentos_hash_unico ON documentos(processo_id, sha256);

CREATE TABLE analises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id uuid NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  escritorio_id uuid NOT NULL REFERENCES escritorios(id) ON DELETE CASCADE,
  solicitado_por uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  analise_anterior_id uuid REFERENCES analises(id) ON DELETE SET NULL,
  tipo text NOT NULL CHECK (tipo IN ('inicial', 'atualizacao')),
  status text NOT NULL DEFAULT 'na_fila' CHECK (status IN ('na_fila', 'extraindo', 'analisando', 'redigindo', 'concluida', 'erro')),
  progresso text,
  erro text,
  resultado jsonb,
  campos jsonb,
  andamento text,
  variante text NOT NULL DEFAULT 'padrao',
  formalidade text NOT NULL DEFAULT 'padrao',
  aprovado_por uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  aprovado_em timestamptz,
  salvo_no_historico boolean NOT NULL DEFAULT false,
  modelo text,
  tokens_entrada bigint NOT NULL DEFAULT 0,
  tokens_saida bigint NOT NULL DEFAULT 0,
  custo_estimado_usd numeric(12, 4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analises_processo_idx ON analises(processo_id, created_at DESC);

CREATE TABLE analise_documentos (
  analise_id uuid NOT NULL REFERENCES analises(id) ON DELETE CASCADE,
  documento_id uuid NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
  novo boolean NOT NULL DEFAULT true,
  PRIMARY KEY (analise_id, documento_id)
);

CREATE TABLE andamento_versoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analise_id uuid NOT NULL REFERENCES analises(id) ON DELETE CASCADE,
  texto text NOT NULL,
  variante text NOT NULL,
  origem text NOT NULL CHECK (origem IN ('ia', 'edicao_manual')),
  criado_por uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auditoria (
  id bigserial PRIMARY KEY,
  escritorio_id uuid REFERENCES escritorios(id) ON DELETE CASCADE,
  usuario_id uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  acao text NOT NULL,
  entidade text,
  entidade_id text,
  detalhes jsonb,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auditoria_escritorio_idx ON auditoria(escritorio_id, created_at DESC);
