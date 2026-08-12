const pool = require('../db/connection');

async function registrarAtividade(termoBusca, tipoBusca, ip) {
  const result = await pool.query(
    `INSERT INTO search_activities (termo_busca, tipo_busca, ip)
     VALUES ($1, $2, $3) RETURNING id`,
    [termoBusca, tipoBusca, ip]
  );
  return result.rows[0].id;
}

// Busca completa de uma pessoa por ID — retorna todos os dados incluindo
// telefones, emails e endereços agregados via subquery.
async function buscarDadosCompletos(ids) {
  if (!ids.length) return [];
  const { rows } = await pool.query(
    `SELECT
       p.id,
       p.nome,
       p.cpf,
       p.cns,
       p.nome_mae,
       p.nome_pai,
       p.data_nascimento,
       p.sexo,
       p.raca_cor,
       p.falecido,
       p.data_falecimento,
       p.rg,
       p.rg_orgao_emissor,
       p.rg_data_emissao,
       p.nis,
       (SELECT json_agg(json_build_object('numero', t.numero, 'tipo', t.tipo))
        FROM telefones t WHERE t.pessoa_id = p.id) AS telefones,
       (SELECT json_agg(json_build_object('email', e.email))
        FROM emails e WHERE e.pessoa_id = p.id) AS emails,
       (SELECT json_agg(json_build_object(
          'rua', en.logradouro,
          'numero', en.numero,
          'complemento', en.complemento,
          'bairro', en.bairro,
          'cidade', en.cidade,
          'estado', en.estado,
          'cep', en.cep
        )) FROM enderecos en WHERE en.pessoa_id = p.id) AS enderecos
     FROM pessoas p
     WHERE p.id = ANY($1::int[])`,
    [ids]
  );
  return rows;
}

async function buscarPorNome(nome) {
  const { rows } = await pool.query(
    `WITH termo AS (SELECT normaliza_nome($1) AS q)
     SELECT p.id,
            similarity(normaliza_nome(p.nome), t.q) AS score
     FROM pessoas p, termo t
     WHERE to_tsvector('simple', normaliza_nome(p.nome)) @@ plainto_tsquery('simple', t.q)
        OR similarity(normaliza_nome(p.nome), t.q) > 0.35
     ORDER BY score DESC
     LIMIT 10`,
    [nome]
  );
  const ids = rows.map((r) => r.id);
  return buscarDadosCompletos(ids);
}

async function buscarPorCpf(cpf) {
  const cpfLimpo = cpf.replace(/\D/g, '');
  const { rows } = await pool.query(
    `SELECT id FROM pessoas WHERE cpf = $1 LIMIT 1`,
    [cpfLimpo]
  );
  const ids = rows.map((r) => r.id);
  return buscarDadosCompletos(ids);
}

async function buscarPorEmail(email) {
  const { rows } = await pool.query(
    `SELECT DISTINCT p.id FROM pessoas p
     INNER JOIN emails e ON e.pessoa_id = p.id
     WHERE LOWER(e.email) = LOWER($1) LIMIT 10`,
    [email]
  );
  const ids = rows.map((r) => r.id);
  return buscarDadosCompletos(ids);
}

async function buscarPorTelefone(telefone) {
  const numeroLimpo = telefone.replace(/\D/g, '');
  const { rows } = await pool.query(
    `SELECT DISTINCT p.id FROM pessoas p
     INNER JOIN telefones t ON t.pessoa_id = p.id
     WHERE regexp_replace(t.numero, '\\D', '', 'g') = $1 LIMIT 10`,
    [numeroLimpo]
  );
  const ids = rows.map((r) => r.id);
  return buscarDadosCompletos(ids);
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

function formatarTelefones(telefones) {
  if (!telefones) return { celular: null, telefone: null, contato: null };
  const cel = telefones.find((t) => t.tipo === 'celular');
  const tel = telefones.find((t) => t.tipo === 'telefone' || t.tipo === 'fixo');
  const cont = telefones.find((t) => t.tipo === 'contato');
  return {
    celular: cel ? cel.numero : null,
    telefone: tel ? tel.numero : null,
    contato: cont ? cont.numero : null,
  };
}

function formatarResultado(rows) {
  return rows.map((p) => {
    const fones = formatarTelefones(p.telefones);
    const emails = p.emails ? p.emails.map((e) => e.email) : [];
    const enderecos = p.enderecos || [];

    return {
      BasicData: {
        Nome: p.nome || null,
        CPF: p.cpf || null,
        CNS: p.cns || null,
        DataNascimento: p.data_nascimento
          ? new Date(p.data_nascimento).toISOString().split('T')[0]
          : null,
        Idade: calcularIdade(p.data_nascimento),
        Sexo: p.sexo || null,
        RacaCor: p.raca_cor || null,
        Falecido: p.falecido || false,
        DataFalecimento: p.data_falecimento
          ? new Date(p.data_falecimento).toISOString().split('T')[0]
          : null,
        Mae: p.nome_mae || null,
        Pai: p.nome_pai || null,
      },
      Documentos: {
        RG: p.rg || null,
        RGOrgaoEmissor: p.rg_orgao_emissor || null,
        RGDataEmissao: p.rg_data_emissao
          ? new Date(p.rg_data_emissao).toISOString().split('T')[0]
          : null,
        NIS: p.nis || null,
      },
      Contatos: {
        Celular: fones.celular,
        Telefone: fones.telefone,
        Contato: fones.contato,
        Emails: emails,
      },
      Enderecos: enderecos.map((en) => ({
        Rua: en.rua || null,
        Numero: en.numero || null,
        Complemento: en.complemento || null,
        Bairro: en.bairro || null,
        Cidade: en.cidade || null,
        Estado: en.estado || null,
        CEP: en.cep || null,
      })),
    };
  });
}

module.exports = {
  registrarAtividade,
  buscarPorNome,
  buscarPorCpf,
  buscarPorEmail,
  buscarPorTelefone,
  formatarResultado,
};
