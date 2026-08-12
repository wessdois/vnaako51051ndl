-- Tabela principal de pessoas
CREATE TABLE IF NOT EXISTS pessoas (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  cpf VARCHAR(14) UNIQUE,
  nome_mae VARCHAR(255),
  data_nascimento DATE,
  sexo CHAR(1),
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

-- Índices para buscas rápidas
CREATE INDEX IF NOT EXISTS idx_pessoas_nome ON pessoas USING gin(to_tsvector('portuguese', nome));
CREATE INDEX IF NOT EXISTS idx_pessoas_cpf ON pessoas(cpf);
CREATE INDEX IF NOT EXISTS idx_telefones_numero ON telefones(numero);
CREATE INDEX IF NOT EXISTS idx_emails_email ON emails(email);
CREATE INDEX IF NOT EXISTS idx_leads_hash ON leads(hash);
