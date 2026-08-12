const pool = require('../db/connection');
const { buscarECachear } = require('./susService');

async function registrarAtividade(termoBusca, tipoBusca, ip) {
  const result = await pool.query(
    `INSERT INTO search_activities (termo_busca, tipo_busca, ip)
     VALUES ($1, $2, $3) RETURNING id`,
    [termoBusca, tipoBusca, ip]
  );
  return result.rows[0].id;
}

// Busca tolerante a acento e a palavras nao-contiguas.
// FTS 'simple' exige que todas as palavras existam ("jose ferreira" acha
// "Jose Carlos Ferreira"); similarity() serve de fallback para erro de digitacao.
async function buscarPorNome(nome) {
  const { rows } = await pool.query(
    `WITH termo AS (SELECT normaliza_nome($1) AS q)
     SELECT p.id, p.nome, p.cpf, p.nome_mae, p.data_nascimento, p.sexo,
            similarity(normaliza_nome(p.nome), t.q) AS score
     FROM pessoas p, termo t
     WHERE to_tsvector('simple', normaliza_nome(p.nome)) @@ plainto_tsquery('simple', t.q)
        OR similarity(normaliza_nome(p.nome), t.q) > 0.35
     ORDER BY score DESC
     LIMIT 10`,
    [nome]
  );
  return rows;
}

async function buscarPorCpf(cpf) {
  const cpfLimpo = cpf.replace(/\D/g, '');

  // 1️⃣  Banco local (Supabase)
  const { rows } = await pool.query(
    `SELECT p.id, p.nome, p.cpf, p.nome_mae, p.data_nascimento, p.sexo
     FROM pessoas p WHERE p.cpf = $1 LIMIT 1`,
    [cpfLimpo]
  );

  if (rows.length > 0) return rows;

  // 2️⃣  Fallback: API pública do SUS → cacheia no Supabase
  console.log(`[SUS] CPF ${cpfLimpo} não no banco local — consultando API SUS...`);
  const dadosSus = await buscarECachear(cpfLimpo);

  if (!dadosSus) return []; // CPF genuinamente não encontrado

  // Normaliza para o mesmo shape que o pool.query retornaria
  return [{
    id:              dadosSus.id              || null,
    nome:            dadosSus.nome            || '',
    cpf:             dadosSus.cpf             || cpfLimpo,
    nome_mae:        dadosSus.nome_mae        || '',
    data_nascimento: dadosSus.data_nascimento || null,
    sexo:            dadosSus.sexo            || '',
  }];
}

async function buscarPorEmail(email) {
  const { rows } = await pool.query(
    `SELECT p.id, p.nome, p.cpf, p.nome_mae, p.data_nascimento, p.sexo
     FROM pessoas p
     INNER JOIN emails e ON e.pessoa_id = p.id
     WHERE LOWER(e.email) = LOWER($1) LIMIT 10`,
    [email]
  );
  return rows;
}

async function buscarPorTelefone(telefone) {
  const numeroLimpo = telefone.replace(/\D/g, '');
  const { rows } = await pool.query(
    `SELECT p.id, p.nome, p.cpf, p.nome_mae, p.data_nascimento, p.sexo
     FROM pessoas p
     INNER JOIN telefones t ON t.pessoa_id = p.id
     WHERE regexp_replace(t.numero, '\\D', '', 'g') = $1 LIMIT 10`,
    [numeroLimpo]
  );
  return rows;
}

function calcularIdade(dataNascimento) {
  if (!dataNascimento) return null;
  const hoje = new Date();
  const nasc = new Date(dataNascimento);
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade;
}

function formatarResultado(rows) {
  return rows.map((p) => ({
    BasicData: {
      Name: p.nome,
      TaxIdNumber: p.cpf || '',
      MotherName: p.nome_mae || '',
      BirthDate: p.data_nascimento
        ? new Date(p.data_nascimento).toISOString()
        : null,
      Age: calcularIdade(p.data_nascimento),
      Gender: p.sexo || '',
    },
  }));
}

module.exports = {
  registrarAtividade,
  buscarPorNome,
  buscarPorCpf,
  buscarPorEmail,
  buscarPorTelefone,
  formatarResultado,
};
