-- =============================================================
-- Extensões necessárias
-- =============================================================
CREATE EXTENSION IF NOT EXISTS unaccent;   -- remove acentos
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- busca por similaridade (trigram)

-- Função de normalização: minúsculo + sem acento + sem espaço duplo
-- Usada nos índices e nas queries de busca por nome
CREATE OR REPLACE FUNCTION normaliza_nome(texto text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT regexp_replace(
    lower(unaccent(texto)),
    '\s+', ' ', 'g'
  )
$$;

-- =============================================================
-- Tabela principal de pessoas
CREATE TABLE IF NOT EXISTS pessoas (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  cpf VARCHAR(14) UNIQUE,
  cns VARCHAR(20),
  nome_mae VARCHAR(255),
  nome_pai VARCHAR(255),
  data_nascimento DATE,
  sexo CHAR(1),
  raca_cor VARCHAR(30),
  falecido BOOLEAN DEFAULT FALSE,
  data_falecimento DATE,
  rg VARCHAR(20),
  rg_orgao_emissor VARCHAR(20),
  rg_data_emissao DATE,
  nis VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Telefones vinculados a uma pessoa
CREATE TABLE IF NOT EXISTS telefones (
  id SERIAL PRIMARY KEY,
  pessoa_id INT REFERENCES pessoas(id) ON DELETE CASCADE,
  numero VARCHAR(20),
  tipo VARCHAR(20) DEFAULT 'celular'
);

-- Emails vinculados a uma pessoa
CREATE TABLE IF NOT EXISTS emails (
  id SERIAL PRIMARY KEY,
  pessoa_id INT REFERENCES pessoas(id) ON DELETE CASCADE,
  email VARCHAR(255)
);

-- Endereços vinculados a uma pessoa
CREATE TABLE IF NOT EXISTS enderecos (
  id SERIAL PRIMARY KEY,
  pessoa_id INT REFERENCES pessoas(id) ON DELETE CASCADE,
  logradouro VARCHAR(255),
  numero VARCHAR(20),
  complemento VARCHAR(100),
  bairro VARCHAR(100),
  cidade VARCHAR(100),
  estado CHAR(2),
  cep VARCHAR(9)
);

-- Vínculos entre pessoas (familiar, vizinho etc.)
CREATE TABLE IF NOT EXISTS vinculos (
  id SERIAL PRIMARY KEY,
  pessoa_id INT REFERENCES pessoas(id) ON DELETE CASCADE,
  pessoa_vinculada_id INT REFERENCES pessoas(id) ON DELETE CASCADE,
  tipo VARCHAR(50)
);

-- Registro de atividades de busca (para rastrear o search_activity_id)
CREATE TABLE IF NOT EXISTS search_activities (
  id SERIAL PRIMARY KEY,
  termo_busca VARCHAR(255),
  tipo_busca VARCHAR(50),
  ip VARCHAR(45),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Leads de checkout
CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  hash VARCHAR(64) UNIQUE NOT NULL,
  sku VARCHAR(20) NOT NULL,
  search_activity_id INT REFERENCES search_activities(id),
  utm_source VARCHAR(100),
  utm_medium VARCHAR(100),
  utm_campaign VARCHAR(100),
  origem TEXT,
  checkout_url TEXT,
  pago BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================================
-- Índices — permitem buscar sem varrer a tabela inteira
-- =============================================================

-- Busca por nome: FTS (full-text) sobre nome normalizado
-- Usado pelo plainto_tsquery na query de busca por nome
CREATE INDEX IF NOT EXISTS idx_pessoas_fts
  ON pessoas USING gin(to_tsvector('simple', normaliza_nome(nome)));

-- Busca por similaridade (similarity > 0.35) — trigram GIN
-- Sem este índice o PostgreSQL varre TODOS os registros a cada busca por nome
CREATE INDEX IF NOT EXISTS idx_pessoas_trgm
  ON pessoas USING gin(normaliza_nome(nome) gin_trgm_ops);

-- Busca exata por documento
CREATE INDEX IF NOT EXISTS idx_pessoas_cpf ON pessoas(cpf);
CREATE INDEX IF NOT EXISTS idx_pessoas_cns ON pessoas(cns);
CREATE INDEX IF NOT EXISTS idx_pessoas_rg  ON pessoas(rg);
CREATE INDEX IF NOT EXISTS idx_pessoas_nis ON pessoas(nis);

-- Busca por telefone e e-mail
CREATE INDEX IF NOT EXISTS idx_telefones_numero ON telefones(numero);
CREATE INDEX IF NOT EXISTS idx_emails_email      ON emails(email);

-- Leads
CREATE INDEX IF NOT EXISTS idx_leads_hash ON leads(hash);
