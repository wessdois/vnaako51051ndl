// searchService.js — orquestrador de busca (fan-out).
//
// Uma busca dispara VÁRIAS APIs de apisbrasilpro.site em paralelo, cada resposta
// é normalizada por seu mapper e tudo é fundido num único dossiê. Fontes que
// falham ou não têm o formato esperado são simplesmente ignoradas.
//
// Fontes ainda sem JSON de exemplo (credilink, br21m, cadsus, cnpj) passam pelo
// mapGeneric, que detecta o formato pela forma do objeto — quando o formato
// exato chegar, basta trocar por um mapper dedicado sem mexer no resto.

const { call } = require('./apisbrasil/client');
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

// Entry point. Retorna [] (nada encontrado) ou [dossiê].
async function buscar(tipo, valorBruto) {
  const valor = cleanValor(tipo, valorBruto);
  if (!valor) return [];

  const plano = planFor(tipo, valor);
  if (!plano.length) return [];

  const respostas = await Promise.allSettled(
    plano.map(async (s) => {
      const raw = await call(s.endpoint, s.params);
      if (!raw) return null;
      return s.map(raw); // partial | partial[] | null
    }),
  );

  const partials = [];
  for (const r of respostas) {
    if (r.status !== 'fulfilled' || !r.value) continue;
    const val = Array.isArray(r.value) ? r.value : [r.value];
    for (const p of val) if (partialTemDados(p)) partials.push(p);
  }

  if (!partials.length) return [];

  const dossie = mergeDossie(partials);
  return dossieTemDados(dossie) ? [dossie] : [];
}

module.exports = { buscar };
