// searchService.js — orquestrador de busca (fan-out).
//
// Uma busca dispara VÁRIAS APIs de apisbrasilpro.site em paralelo, cada resposta
// é normalizada por seu mapper e tudo é fundido num único dossiê. Fontes que
// falham ou não têm o formato esperado são simplesmente ignoradas.
//
// Fontes ainda sem JSON de exemplo (credilink, br21m, cadsus, cnpj) passam pelo
// mapGeneric, que detecta o formato pela forma do objeto — quando o formato
// exato chegar, basta trocar por um mapper dedicado sem mexer no resto.

const { call, parseLoose } = require('./apisbrasil/client');
const M = require('./apisbrasil/mappers');
const { mergeDossie } = require('./apisbrasil/merge');

// Fallback: tenta reconhecer o formato pela forma do objeto.
const mapGeneric = (raw) => M.detectAndMap(raw);

// Atalho para declarar uma fonte do plano.
const src = (endpoint, params, map) => ({ endpoint, params, map });

// Limpa o valor conforme o tipo de busca.
function cleanValor(tipo, valor) {
  const v = String(valor || '').trim();
  switch (tipo) {
    case 'cpf': case 'rg': case 'telefone': case 'cnpj': case 'cep':
      return v.replace(/\D/g, '');
    case 'placa':
      return v.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    default: // email, nome, nome_mae
      return v;
  }
}

// Mapa de fan-out: para cada tipo de entrada, quais APIs consultar.
function planFor(tipo, v) {
  switch (tipo) {
    case 'cpf':
      return [
        src('consulta_serasa.php', { cpf: v }, M.mapSerasa),
        src('api_full.php', { cpf: v }, M.mapApiFull),
        src('dados01.php', { action: 'consultar_cpf', cpf: v }, M.mapDados01),
        src('fotoma.php', { cpf: v }, M.mapFoto),
        src('fotoro.php', { cpf: v }, M.mapFoto),
        src('situacao.php', { cpf: v }, M.mapSituacao),
        src('compras_paycom.php', { identity: v }, M.mapCompras),
        src('spc2.php', { cpf: v }, mapGeneric),
        src('credilink.php', { cpf: v }, mapGeneric),
        src('telefone0.php', { cpf: v }, mapGeneric),
      ];
    case 'rg':
      return [
        src('consulta_serasa.php', { rg: v }, M.mapSerasa),
        src('dados01.php', { action: 'buscar_rg', rg: v }, M.mapDados01),
      ];
    case 'email':
      return [
        src('consulta_serasa.php', { email: v }, M.mapSerasa),
        src('api_full.php', { email: v }, M.mapApiFull),
        src('spc2.php', { email: v }, mapGeneric),
        src('credilink.php', { email: v }, mapGeneric),
        src('cadsus.php', { email: v }, mapGeneric),
      ];
    case 'telefone':
      return [
        src('consulta_serasa.php', { telefone: v }, M.mapSerasa),
        src('api_full.php', { telefone: v }, M.mapApiFull),
        src('spc1.php', { telefone: v }, M.mapSpc1),
        src('telefone0.php', { telefone: v }, mapGeneric),
        src('telefone1.php', { telefone: v }, M.mapTelefoneSimples),
        src('br21m.php', { telefone: v }, mapGeneric),
        src('compras_paycom.php', { telephone: v }, M.mapCompras),
      ];
    case 'placa':
      return [
        src('spc2.php', { placa: v }, M.mapSpc2Veic),
        src('credauto_bin.php', { campo: 'PLACA', valor: v }, M.mapCredautoBin),
        src('credauto_emplacamento.php', { campo: 'PLACA', valor: v }, M.mapCredautoEmpl),
        src('detran.php', { placa: v }, M.mapDetran),
      ];
    case 'cnpj':
      return [src('spc2.php', { cnpj: v }, mapGeneric)];
    case 'cep':
      return [
        src('credilink.php', { cep: v }, mapGeneric),
        src('spc2.php', { cep: v }, mapGeneric),
        src('telefone0.php', { cep: v }, mapGeneric),
      ];
    case 'nome_mae':
      return [
        src('spc2.php', { nome_mae: v }, mapGeneric),
        src('credilink.php', { nome_mae: v }, mapGeneric),
      ];
    case 'nome':
      return [
        src('consulta_serasa.php', { nome: v }, M.mapSerasa),
        src('spc2.php', { nome: v }, mapGeneric),
        src('credilink.php', { nome: v }, mapGeneric),
      ];
    default:
      return [];
  }
}

// Um partial "tem dados" se contribui com algo aproveitável.
function partialTemDados(p) {
  if (!p) return false;
  const b = p.basic || {};
  return !!(b.Nome || b.CPF || (p.telefones || []).length || (p.emails || []).length ||
    (p.enderecos || []).length || (p.veiculos || []).length || (p.compras || []).length ||
    p.foto || p.score || p.identidade || p.situacao);
}

// O dossiê final "tem dados"?
function dossieTemDados(r) {
  if (!r) return false;
  const b = r.BasicData || {};
  const c = r.Contatos || {};
  return !!(b.Nome || b.CPF || (r.Veiculos || []).length || (r.Compras || []).length ||
    (r.Enderecos || []).length || (c.Telefones || []).length || (c.Emails || []).length || r.Foto);
}

// Trunca strings gigantes (base64 de foto etc.) no dump cru, mantendo o resto.
function sanitizeRaw(v, prof) {
  if (prof > 6) return null;
  if (v === null || v === undefined) return v;
  if (typeof v === 'string') return v.length > 180 ? v.slice(0, 60) + '… [+' + (v.length - 60) + ' chars]' : v;
  if (Array.isArray(v)) return v.map((x) => sanitizeRaw(x, prof + 1));
  if (typeof v === 'object') {
    const o = {};
    for (const [k, val] of Object.entries(v)) o[k] = sanitizeRaw(val, prof + 1);
    return o;
  }
  return v;
}

// A resposta crua tem conteúdo aproveitável? (evita despejar fontes vazias)
function rawTemConteudo(raw) {
  if (!raw || typeof raw !== 'object') return false;
  if (raw.sucesso === false || raw.erro === true) return false;
  for (const chave of ['dados', 'resultado', 'resultados', 'data', 'results']) {
    const v = raw[chave];
    if (Array.isArray(v) && v.length) return true;
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length) return true;
  }
  return false;
}

// Acumula a resposta crua de cada fonte (api_full é desmembrado por sub-fonte).
function coletarRaw(endpoint, raw, out) {
  const nome = endpoint.replace(/\.php$/, '');
  if (nome === 'api_full' && Array.isArray(raw && raw.dados)) {
    raw.dados.forEach((item, i) => {
      const obj = parseLoose(item && item.conteudo);
      if (rawTemConteudo(obj)) out.push({ fonte: `api_full[${i + 1}]`, dados: sanitizeRaw(obj, 0) });
    });
    return;
  }
  if (rawTemConteudo(raw)) out.push({ fonte: nome, dados: sanitizeRaw(raw, 0) });
}

// ─────────────────────────────────────────────────────────────────────────────
// Busca por NOME — retorna uma LISTA de pessoas (um dossiê por pessoa distinta),
// agrupando os registros por CPF (ou, na falta dele, por nome normalizado).
// ─────────────────────────────────────────────────────────────────────────────
async function buscarPorNome(valor) {
  const v = valor.trim();
  if (!v) return [];

  const fontes = [
    src('consulta_serasa.php', { nome: v }),
    src('spc1.php', { nome: v }),
    src('spc2.php', { nome: v }),
    src('dados01.php', { action: 'buscar_nome', nome: v }),
    src('credilink.php', { nome: v }),
  ];

  const respostas = await Promise.allSettled(
    fontes.map(async (s) => ({ endpoint: s.endpoint, raw: await call(s.endpoint, s.params) })),
  );

  const pessoas = [];
  const rawFontes = [];
  for (const r of respostas) {
    if (r.status !== 'fulfilled' || !r.value.raw) continue;
    coletarRaw(r.value.endpoint, r.value.raw, rawFontes);
    for (const p of M.extractPessoas(r.value.raw)) if (partialTemDados(p)) pessoas.push(p);
  }
  if (!pessoas.length) return [];

  // Agrupa por pessoa: CPF quando existe, senão nome normalizado.
  const grupos = new Map();
  for (const p of pessoas) {
    const cpf = p.basic.CPF ? p.basic.CPF.replace(/\D/g, '') : '';
    const chave = cpf || 'nome:' + (p.basic.Nome || '').toUpperCase().replace(/\s+/g, ' ').trim();
    if (chave === 'nome:') continue;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(p);
  }

  const dossies = [];
  for (const grupo of grupos.values()) {
    const d = mergeDossie(grupo);
    if (dossieTemDados(d)) dossies.push(d);
  }

  // Prioriza quem tem CPF; limita para não estourar a resposta.
  dossies.sort((a, b) => (b.BasicData.CPF ? 1 : 0) - (a.BasicData.CPF ? 1 : 0));
  const top = dossies.slice(0, 30);
  // O dump cru é grande e cobre todas as pessoas — anexa só no primeiro card.
  if (top[0]) top[0].RawFontes = rawFontes;
  return top;
}

// Entry point. Retorna [] (nada encontrado) ou [dossiê].
async function buscar(tipo, valorBruto) {
  const valor = cleanValor(tipo, valorBruto);
  if (!valor) return [];

  // Nome tem fluxo próprio: retorna várias pessoas, não uma pessoa fundida.
  if (tipo === 'nome') return buscarPorNome(valor);

  const plano = planFor(tipo, valor);
  if (!plano.length) return [];

  const respostas = await Promise.allSettled(
    plano.map(async (s) => {
      const raw = await call(s.endpoint, s.params);
      return { endpoint: s.endpoint, raw, mapped: raw ? s.map(raw) : null };
    }),
  );

  const partials = [];
  const rawFontes = [];
  for (const r of respostas) {
    if (r.status !== 'fulfilled' || !r.value) continue;
    const { endpoint, raw, mapped } = r.value;
    if (mapped) {
      const val = Array.isArray(mapped) ? mapped : [mapped];
      for (const p of val) if (partialTemDados(p)) partials.push(p);
    }
    if (raw) coletarRaw(endpoint, raw, rawFontes);
  }

  if (!partials.length) return [];

  const dossie = mergeDossie(partials);
  if (!dossieTemDados(dossie)) return [];

  // Anexa TODOS os dados crus por fonte — o frontend exibe tudo, inclusive
  // campos que nenhum mapper específico tratou (e APIs futuras aparecem sozinhas).
  dossie.RawFontes = rawFontes;
  return [dossie];
}

module.exports = { buscar };
