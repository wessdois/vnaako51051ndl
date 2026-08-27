// client.js — chamada HTTP de baixo nível para apisbrasilpro.site.
//
// Dois cuidados que a fonte exige:
//   1) Toda resposta vem prefixada com o lixo "api desenvolvida por @astrahvhdev
//      telegram" ANTES do JSON. Precisa ser removido antes do parse.
//   2) Algumas respostas (api_full) embrulham outras respostas como STRING dentro
//      de dados[].conteudo — também prefixadas. parseLoose lida com os dois casos.

const axios = require('axios');

const BASE = process.env.APISBRASIL_BASE || 'http://apisbrasilpro.site';
const TIMEOUT = parseInt(process.env.APISBRASIL_TIMEOUT_MS || '15000', 10);

// Remove qualquer preâmbulo antes do primeiro { ou [ e faz JSON.parse.
// Aceita tanto string quanto objeto já parseado.
function parseLoose(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'object') return raw;
  const str = String(raw);
  const i = str.search(/[{[]/);
  if (i === -1) return null;
  try {
    return JSON.parse(str.slice(i));
  } catch {
    return null;
  }
}

// GET em um endpoint. Retorna o objeto parseado ou null (nunca lança).
// params: objeto de query string, ex.: { cpf: '123' } ou { campo: 'PLACA', valor: 'ABC1234' }
async function call(endpoint, params) {
  try {
    const { data } = await axios.get(`${BASE}/${endpoint}`, {
      params,
      timeout: TIMEOUT,
      responseType: 'text',
      // Desliga o parse automático do axios: a resposta tem prefixo e quebraria.
      transformResponse: [(d) => d],
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    return parseLoose(data);
  } catch (err) {
    console.error(`[apisbrasil] ${endpoint} falhou:`, err.message);
    return null;
  }
}

module.exports = { call, parseLoose, BASE };
