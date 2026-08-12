/**
 * susService.js — BuscaPrime
 * Consulta a API pública do SUS e cacheia no Supabase.
 * Proxy público gratuito rotacionado automaticamente.
 */

const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const pool = require('../db/connection');

const SUS_URL = 'http://dabsistemas.saude.gov.br/sistemas/sadab/js/buscar_cpf_dbpessoa.json.php';
const TIMEOUT = parseInt(process.env.SUS_TIMEOUT_MS || '10000', 10);

// ---------------------------------------------------------------------------
// Pool de proxies públicos gratuitos (HTTP CONNECT).
// Lista rotacionada — adicione mais em SUS_PROXIES no .env separados por vírgula.
// ---------------------------------------------------------------------------
const DEFAULT_PROXIES = [
  'http://51.79.50.31:9300',
  'http://165.225.208.243:10605',
  'http://103.152.112.145:80',
  'http://47.88.3.19:8080',
  'http://20.111.54.16:8123',
];

function getProxyList() {
  const env = process.env.SUS_PROXIES;
  if (env && env.trim()) {
    return env.split(',').map((p) => p.trim()).filter(Boolean);
  }
  return DEFAULT_PROXIES;
}

// Rotação round-robin simples — persiste por processo, não por req
let _proxyIndex = 0;
function nextProxy() {
  const list = getProxyList();
  const proxy = list[_proxyIndex % list.length];
  _proxyIndex++;
  return proxy;
}

// ---------------------------------------------------------------------------
// Consulta na API do SUS com fallback de proxy
// ---------------------------------------------------------------------------
async function buscarNaSus(cpf) {
  const cpfLimpo = cpf.replace(/\D/g, '');
  const url = `${SUS_URL}?cpf=${cpfLimpo}`;

  // Tenta direto primeiro, depois até 2 proxies antes de desistir
  const proxies = [null, ...getProxyList().slice(0, 2)];
  let lastErr;

  for (const proxyUrl of proxies) {
    try {
      const config = {
        timeout: TIMEOUT,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; BuscaPrime/2.0)',
        },
      };

      if (proxyUrl) {
        const agent = new HttpsProxyAgent(proxyUrl);
        config.httpsAgent = agent;
        config.httpAgent  = agent;
        console.log(`[SUS] Tentando via proxy: ${proxyUrl}`);
      }

      const { data } = await axios.get(url, config);

      // API retorna {} ou objeto com NU_CPF quando achou
      if (!data || !data.NU_CPF || data.NU_CPF.length < 10) {
        return null; // CPF não encontrado na base do SUS
      }

      return normalizarResposta(data);
    } catch (err) {
      lastErr = err;
      console.warn(`[SUS] Falhou ${proxyUrl || 'direto'}: ${err.message}`);
      continue;
    }
  }

  console.error('[SUS] Todos os proxies falharam:', lastErr?.message);
  return null;
}

// ---------------------------------------------------------------------------
// Normaliza resposta do SUS para o formato interno
// { nome, cpf, nome_mae, data_nascimento, sexo }
// ---------------------------------------------------------------------------
function normalizarResposta(data) {
  // NASCIMENTO vem como "dd/MM/yyyy"
  let dataNasc = null;
  if (data.NASCIMENTO) {
    const partes = data.NASCIMENTO.split('/');
    if (partes.length === 3) {
      dataNasc = `${partes[2]}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')}`;
    } else {
      dataNasc = data.NASCIMENTO;
    }
  }

  return {
    cpf:             data.NU_CPF.replace(/\D/g, ''),
    nome:            data.NO_PESSOA_FISICA || '',
    nome_mae:        data.NO_MAE || '',
    data_nascimento: dataNasc,
    sexo:            data.CO_SEXO || '',
  };
}

// ---------------------------------------------------------------------------
// Persiste no Supabase para cache — ON CONFLICT atualiza dados
// ---------------------------------------------------------------------------
async function cachearNoBanco(pessoa) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO pessoas (cpf, nome, nome_mae, data_nascimento, sexo)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (cpf) DO UPDATE
         SET nome            = EXCLUDED.nome,
             nome_mae        = EXCLUDED.nome_mae,
             data_nascimento = EXCLUDED.data_nascimento,
             sexo            = EXCLUDED.sexo
       RETURNING id, cpf, nome, nome_mae, data_nascimento, sexo`,
      [pessoa.cpf, pessoa.nome, pessoa.nome_mae, pessoa.data_nascimento, pessoa.sexo]
    );
    console.log(`[SUS] Cacheado no Supabase: ${pessoa.cpf} — ${pessoa.nome}`);
    return rows[0] || null;
  } catch (err) {
    // Cache falhou? Não trava o request — só loga
    console.error('[SUS] Erro ao cachear no Supabase:', err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Entry point: busca SUS + cache Supabase
// ---------------------------------------------------------------------------
async function buscarECachear(cpf) {
  const dados = await buscarNaSus(cpf);
  if (!dados) return null;

  const cached = await cachearNoBanco(dados);
  return cached || dados;
}

module.exports = { buscarECachear, buscarNaSus };
