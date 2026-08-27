// merge.js — funde os "partials" de várias fontes num único dossiê.
//
// Regras:
//   • Campos escalares (Nome, CPF...): o primeiro valor não-nulo vence. A ordem
//     dos partials define a prioridade — o orquestrador coloca o serasa primeiro.
//   • Listas (telefones, e-mails, endereços, veículos, compras): concatenadas e
//     deduplicadas por uma chave estável.
//   • Score/Poder/Foto/Identidade/Situação: primeiro não-nulo vence.

const N = require('./normalize');

// Preenche em `alvo` só as chaves que ainda estão vazias em `alvo`.
function preencherVazios(alvo, origem) {
  if (!origem) return;
  for (const [k, v] of Object.entries(origem)) {
    if (v === null || v === undefined || v === '' || v === false) continue;
    if (alvo[k] === null || alvo[k] === undefined || alvo[k] === '' || alvo[k] === false) {
      alvo[k] = v;
    }
  }
}

// Deduplica uma lista por chave, mesclando campos (o primeiro a chegar manda,
// os seguintes só preenchem lacunas).
function dedup(lista, chaveFn) {
  const mapa = new Map();
  for (const item of lista) {
    if (!item) continue;
    const chave = chaveFn(item);
    if (!chave) continue;
    if (mapa.has(chave)) preencherVazios(mapa.get(chave), item);
    else mapa.set(chave, { ...item });
  }
  return [...mapa.values()];
}

function mergeDossie(partials) {
  const basic = {
    Nome: null, CPF: null, DataNascimento: null, Idade: null, Sexo: null,
    EstadoCivil: null, Nacionalidade: null, Mae: null, Pai: null,
    Falecido: false, DataFalecimento: null, Renda: null, CNS: null,
    RacaCor: null, SituacaoDesde: null,
  };
  const documentos = { RG: null, RGOrgaoEmissor: null, RGUFEmissao: null, TituloEleitor: null, NIS: null };
  const tecnicos = {};
  let score = null, poder = null, foto = null, identidade = null, situacao = null;
  let telefones = [], emails = [], enderecos = [], parentes = [], veiculos = [], compras = [];
  const fontes = new Set();

  for (const p of partials) {
    if (!p) continue;
    fontes.add(p.fonte);
    preencherVazios(basic, p.basic);
    if (p.basic && p.basic.Falecido) { basic.Falecido = true; if (!basic.DataFalecimento) basic.DataFalecimento = p.basic.DataFalecimento || null; }
    preencherVazios(documentos, p.documentos);
    Object.assign(tecnicos, p.tecnicos || {});
    score = score || p.score;
    poder = poder || p.poder;
    foto = foto || p.foto;
    identidade = identidade || p.identidade;
    situacao = situacao || p.situacao;
    telefones = telefones.concat(p.telefones || []);
    emails = emails.concat(p.emails || []);
    enderecos = enderecos.concat(p.enderecos || []);
    parentes = parentes.concat(p.parentes || []);
    veiculos = veiculos.concat(p.veiculos || []);
    compras = compras.concat(p.compras || []);
  }

  basic.Idade = N.idadeDe(basic.DataNascimento);

  telefones = dedup(telefones, (t) => (t.Numero || '').replace(/\D/g, ''));
  emails = dedup(emails, (e) => (e.Email || '').toLowerCase());
  enderecos = dedup(enderecos, (e) =>
    [(e.CEP || '').replace(/\D/g, ''), (e.Numero || ''), (e.Rua || '').toUpperCase()].join('|').replace(/^\|+$/, ''));
  parentes = dedup(parentes, (p) => (p.Nome || '').toUpperCase());
  veiculos = dedup(veiculos, (v) =>
    (v.Placa || '').toUpperCase() || (v.Chassi || '').toUpperCase() || (v.Renavam || '') ||
    [(v.Marca || ''), (v.Modelo || ''), (v.AnoModelo || '')].join('|').toUpperCase());
  compras = dedup(compras, (c) => [c.Nome, c.Documento, c.Email].join('|'));

  const cel = telefones.find((t) => t.Celular) || null;
  const fix = telefones.find((t) => !t.Celular) || null;

  return {
    BasicData: {
      ...basic,
      CPF: basic.CPF ? basic.CPF.replace(/\D/g, '') : null,
    },
    Documentos: documentos,
    Contatos: {
      Celular: cel ? cel.Numero : null,
      Telefone: fix ? fix.Numero : null,
      Telefones: telefones,
      Emails: emails.map((e) => e.Email),
      EmailsDetalhe: emails,
    },
    Enderecos: enderecos,
    Score: score,
    Poder: poder,
    Parentes: parentes,
    Foto: foto,
    Identidade: identidade && Object.values(identidade).some(Boolean) ? identidade : null,
    Veiculos: veiculos,
    Compras: compras,
    SituacaoCadastral: situacao,
    Tecnicos: Object.keys(tecnicos).length ? tecnicos : null,
    Fontes: [...fontes],
  };
}

module.exports = { mergeDossie };
