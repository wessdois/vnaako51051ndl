// mappers.js — cada função converte a resposta de UMA fonte no "partial" comum.
//
// Partial (contrato único que o merge entende):
//   { fonte, basic, documentos, telefones[], emails[], enderecos[],
//     score, poder, parentes[], foto, identidade, veiculos[], compras[],
//     situacao, tecnicos }
//
// Todo mapper é tolerante: entrada inválida -> partial vazio (nunca lança).

const N = require('./normalize');
const { parseLoose } = require('./client');

function emptyPartial(fonte) {
  return {
    fonte,
    basic: {}, documentos: {}, telefones: [], emails: [], enderecos: [],
    score: null, poder: null, parentes: [], foto: null, identidade: null,
    veiculos: [], compras: [], situacao: null, tecnicos: {},
  };
}

// UF válida = 2 letras; usada para descartar campos embaralhados das APIs de telefone.
const ehUF = (v) => /^[A-Za-z]{2}$/.test(String(v || '').trim());
const ehCEP = (v) => /^\d{8}$/.test(String(v || '').replace(/\D/g, ''));

// ───────────────────────── consulta_serasa ─────────────────────────
function mapSerasa(raw) {
  const p = emptyPartial('serasa');
  if (!raw || !raw.resultado || !raw.resultado.dados) return p;

  const res = raw.resultado;
  const d = res.dados;

  const nasc = N.data(d.NASC);
  const obito = N.data(d.DT_OB);
  const rendaNum = N.num(d.RENDA);
  const estCiv = N.g(d, 'ESTCIV');

  p.basic = {
    Nome: N.g(d, 'NOME'),
    CPF: N.digitos(d.CPF),
    DataNascimento: nasc,
    Sexo: N.sexo(d.SEXO),
    EstadoCivil: estCiv ? (N.ESTADO_CIVIL[estCiv] || estCiv) : null,
    Nacionalidade: N.g(d, 'NACIONALID'),
    Mae: N.g(d, 'NOME_MAE'),
    Pai: N.g(d, 'NOME_PAI'),
    Falecido: !!obito,
    DataFalecimento: obito,
    Renda: N.moeda(rendaNum),
    CNS: N.g(d, 'CNS'),
    RacaCor: N.g(d, 'RACA_COR'),
    SituacaoDesde: N.data(d.DT_SIT_CAD),
  };

  p.documentos = {
    RG: N.g(d, 'RG'),
    RGOrgaoEmissor: N.g(d, 'ORGAO_EMISSOR'),
    RGUFEmissao: N.g(d, 'UF_EMISSAO'),
    TituloEleitor: N.g(d, 'TITULO_ELEITOR'),
    NIS: N.txt((res.pis || [])[0]?.PIS),
  };

  p.telefones = (res.telefone || []).map((t) => {
    const ddd = N.digitos(t.DDD) || '';
    const num = N.digitos(t.TELEFONE) || '';
    const full = (ddd + num).replace(/\D/g, '');
    if (!full) return null;
    const soNum = num.replace(/\D/g, '');
    return {
      Numero: full,
      DDD: ddd || null,
      Celular: soNum.length === 9 && soNum.startsWith('9'),
      Desde: N.data(t.DT_INCLUSAO),
      Qualidade: N.txt(t.CLASSIFICACAO),
    };
  }).filter(Boolean);

  p.emails = (res.email || [])
    .slice()
    .sort((a, b) => (a.PRIORIDADE || 99) - (b.PRIORIDADE || 99))
    .map((e) => {
      const end = N.txt(e.EMAIL);
      if (!end) return null;
      return {
        Email: end.toLowerCase(),
        Score: N.txt(e.EMAIL_SCORE),
        Status: N.txt(e.STATUS_VT),
        Estrutura: N.txt(e.ESTRUTURA),
        Blacklist: N.txt(e.BLACKLIST) === 'S',
        Desde: N.data(e.DT_INCLUSAO),
      };
    })
    .filter(Boolean);

  p.enderecos = (res.enderecos || []).map((e) => {
    const rua = [N.txt(e.LOGR_TIPO), N.txt(e.LOGR_NOME)].filter(Boolean).join(' ') || null;
    return {
      Rua: rua,
      Numero: N.txt(e.LOGR_NUMERO),
      Complemento: N.txt(e.LOGR_COMPLEMENTO),
      Bairro: N.txt(e.BAIRRO),
      Cidade: N.txt(e.CIDADE),
      Estado: N.txt(e.UF),
      CEP: N.digitos(e.CEP),
      Desde: N.data(e.DT_INCLUSAO),
      Atualizado: N.data(e.DT_ATUALIZACAO),
    };
  }).filter((e) => e.Rua || e.Cidade || e.CEP);

  const sc = (res.score || [])[0] || {};
  const scoreVal = N.num(sc.CSBA) ?? N.num(sc.CSB8);
  if (scoreVal !== null) {
    p.score = { Valor: Math.round(scoreVal), Faixa: N.txt(sc.CSBA_FAIXA) || N.txt(sc.CSB8_FAIXA), Max: 1000 };
  }

  const pa = (res.poder_aquisitivo || [])[0] || {};
  const rendaPA = N.num(pa.RENDA_PODER_AQUISITIVO);
  if (N.txt(pa.PODER_AQUISITIVO) || rendaPA) {
    p.poder = {
      Classe: N.txt(pa.PODER_AQUISITIVO),
      Renda: N.moeda(rendaPA ?? rendaNum),
      Faixa: N.faixa(pa.FX_PODER_AQUISITIVO),
    };
  }

  p.parentes = (res.parentes || []).map((par) => {
    const nomeV = N.txt(par.NOME_VINCULO);
    if (!nomeV) return null;
    const tipo = (N.txt(par.VINCULO) || '').toUpperCase();
    return { Nome: nomeV, Vinculo: N.VINCULO[tipo] || N.txt(par.VINCULO), CPF: N.digitos(par.CPF_VINCULO) };
  }).filter(Boolean);

  const add = (k, v) => { const x = N.txt(v); if (x) p.tecnicos[k] = x; };
  add('CBO (ocupação)', d.CBO);
  add('Situação cadastral', d.CD_SIT_CAD);
  add('Mosaic', d.CD_MOSAIC);
  add('Mosaic novo', d.CD_MOSAIC_NOVO);
  add('Faixa de renda (cód.)', d.FAIXA_RENDA_ID);

  return p;
}

// ───────────────────────── dados01 (RG / identidade) ─────────────────────────
function mapDados01(raw) {
  const p = emptyPartial('dados01');
  const d = raw && raw.dados;
  if (!d || typeof d !== 'object' || Array.isArray(d)) return p;

  p.basic = {
    Nome: N.txt(d.name),
    CPF: N.digitos(d.cpf),
    DataNascimento: N.data(d.birthDate),
    Sexo: N.sexo(d.sex),
    Mae: N.txt(d.mother),
    Pai: N.txt(d.father),
    Nacionalidade: N.txt(d.nationality),
  };
  p.documentos = { RG: N.txt(d.rg) };
  p.identidade = {
    Naturalidade: N.txt(d.birthCityStateCountry),
    EstadoCivil: N.txt(d.maritalStatus),
    Escolaridade: N.txt(d.educationDegree),
    Ocupacao: N.txt(d.occupation),
    CorPele: N.txt(d.skinColor),
    CorOlhos: N.txt(d.eyeColor),
    TipoOlhos: N.txt(d.eyeType),
    TipoCabelo: N.txt(d.hairType),
    CorCabelo: N.txt(d.hairColor),
    Altura: N.txt(d.height),
    DataEmissaoRG: N.data(d.identityDate),
    Cartorio: N.txt(d.station),
  };
  const img = N.txt(d.picture);
  if (img) p.foto = { Imagem: img, Fonte: 'dados01' };
  return p;
}

// ───────────────────────── fotoma / fotoro / foto0x ─────────────────────────
function mapFoto(raw) {
  const p = emptyPartial('foto');
  const arr = Array.isArray(raw && raw.dados) ? raw.dados : [];
  const reg = arr.find((r) => N.txt(r.imagem)) || arr[0];
  if (!reg) return p;
  p.basic = {
    Nome: N.txt(reg.nome),
    CPF: N.digitos(reg.cpf),
    DataNascimento: N.data(reg.data_nascimento),
    Mae: N.txt(reg.mae),
  };
  const img = N.txt(reg.imagem);
  if (img) p.foto = { Imagem: img, Fonte: 'foto' };
  return p;
}

// ───────────────────────── spc1 (documento -> telefones/endereços) ─────────────────────────
function mapSpc1(raw) {
  const p = emptyPartial('spc1');
  const arr = Array.isArray(raw && raw.resultados) ? raw.resultados : [];
  for (const r of arr) {
    if (!p.basic.Nome) p.basic.Nome = N.txt(r.nome);
    if (!p.basic.CPF) p.basic.CPF = N.digitos(r.doc);
    const ddd = N.digitos(r.ddd) || '';
    const fone = N.digitos(r.fone) || '';
    const full = (ddd + fone).replace(/\D/g, '');
    if (full && full.length >= 8) {
      const soNum = fone;
      p.telefones.push({
        Numero: full, DDD: ddd || null,
        Celular: soNum.length === 9 && soNum.startsWith('9'),
        Desde: null, Qualidade: null,
      });
    }
    const rua = [N.txt(r.tipo_logr), N.txt(r.logradouro)].filter(Boolean).join(' ') || null;
    if (rua || N.txt(r.cidade) || N.digitos(r.cep)) {
      p.enderecos.push({
        Rua: rua, Numero: N.txt(r.numu), Complemento: N.txt(r.compl),
        Bairro: N.txt(r.bairro), Cidade: N.txt(r.cidade), Estado: N.txt(r.uf),
        CEP: N.digitos(r.cep), Desde: null, Atualizado: null,
      });
    }
  }
  return p;
}

// ───────────────────────── telefone0 / telefone1 (rótulos instáveis) ─────────────────────────
// Estas fontes às vezes vêm com os campos embaralhados. Extraímos só o que dá
// pra validar com segurança (cpf, nome) e montamos endereço apenas com campos
// que passam na validação (UF = 2 letras, CEP = 8 dígitos).
function mapTelefoneSimples(raw) {
  const p = emptyPartial('telefone');
  const r = raw && raw.resultado;
  if (!r || typeof r !== 'object') return p;

  p.basic = { Nome: N.txt(r.nome), CPF: N.digitos(r.cpf) };

  // Descobre UF e CEP olhando todos os valores (não confia no rótulo).
  const vals = Object.values(r);
  const uf = vals.find(ehUF) || null;
  const cepVal = vals.find(ehCEP);
  const end = {
    Rua: N.txt(r.endereco) || N.txt(r.logradouro),
    Numero: N.txt(r.numero), Bairro: N.txt(r.bairro),
    Cidade: ehCEP(r.cidade) ? null : N.txt(r.cidade),
    Estado: uf ? String(uf).toUpperCase() : null,
    CEP: cepVal ? String(cepVal).replace(/\D/g, '') : null,
  };
  if (end.Rua || end.CEP || end.Cidade) p.enderecos.push({ ...end, Complemento: null, Desde: null, Atualizado: null });
  const tel = N.digitos(r.telefone);
  if (tel && tel.length >= 10) {
    const soNum = tel.slice(-9);
    p.telefones.push({ Numero: tel, DDD: tel.slice(0, 2), Celular: soNum.length === 9 && soNum.startsWith('9'), Desde: null, Qualidade: null });
  }
  return p;
}

// ───────────────────────── veículos: spc2?placa / detran ─────────────────────────
function veiculoDe(r) {
  return {
    Placa: N.txt(r.placa || r.PLACA),
    Marca: N.txt(r.marca || r.modelo || r.MODELO),
    Modelo: N.txt(r.modelo || r.MODELO || r.marca),
    AnoFabricacao: N.txt(r.anofab || r.ano_fab || r.ANO_FABRICACAO),
    AnoModelo: N.txt(r.anomode || r.ano_mod || r.ANO_MODELO),
    Chassi: N.txt(r.chassi || r.CHASSI),
    Renavam: N.digitos(r.renavan || r.renavam || r.RENAVAM),
    Combustivel: N.txt(r.combu) || N.COMBUSTIVEL[N.txt(r.combustivel)] || null,
    Cidade: N.txt(r.cidade), Estado: N.txt(r.estado || r.uf),
    Proprietario: N.txt(r.propri),
    Fonte: null,
  };
}

function mapVeiculosLista(raw, fonte, campoLista) {
  const p = emptyPartial(fonte);
  const arr = Array.isArray(raw && raw[campoLista]) ? raw[campoLista] : [];
  for (const r of arr) {
    const v = veiculoDe(r);
    v.Fonte = fonte;
    if (v.Placa || v.Chassi || v.Renavam) p.veiculos.push(v);
    if (!p.basic.Nome && N.txt(r.propri)) p.basic.Nome = N.txt(r.propri);
    if (!p.basic.CPF && N.digitos(r.cpf || r.cpf_cnpj)) p.basic.CPF = N.digitos(r.cpf || r.cpf_cnpj);
  }
  return p;
}

const mapSpc2Veic = (raw) => mapVeiculosLista(raw, 'spc2', 'resultados');
const mapDetran = (raw) => mapVeiculosLista(raw, 'detran', 'dados');

// ───────────────────────── credauto_bin / credauto_emplacamento ─────────────────────────
function mapCredauto(raw, fonte) {
  const p = emptyPartial(fonte);
  const arr = Array.isArray(raw && raw.data) ? raw.data : [];
  for (const r of arr) {
    const v = {
      Placa: N.txt(r.PLACA || r.PLACA_MODELO_NOVO),
      Chassi: N.txt(r.CHASSI),
      Renavam: N.digitos(r.RENAVAM),
      AnoFabricacao: N.txt(r.ANO_FABRICACAO),
      AnoModelo: N.txt(r.ANO_MODELO),
      Combustivel: N.COMBUSTIVEL[N.txt(r.COD_COMBUST || r.CD_COMBUSTIVEL)] || null,
      Motor: N.txt(r.NUM_MOTOR || r.NUMERO_MOTOR),
      Cilindradas: N.txt(r.CILINDRADAS || r.CILINDRADA),
      Estado: N.txt(r.UF_JURISDICAO),
      Emplacamento: N.data(r.DT_EMPLACAMENTO || r.DATA_EMPLACAMENTO),
      Fonte: fonte,
    };
    if (v.Placa || v.Chassi || v.Renavam) p.veiculos.push(v);
  }
  return p;
}

const mapCredautoBin = (raw) => mapCredauto(raw, 'credauto_bin');
const mapCredautoEmpl = (raw) => mapCredauto(raw, 'credauto_emplacamento');

// ───────────────────────── compras_paycom ─────────────────────────
function mapCompras(raw) {
  const p = emptyPartial('compras');
  const arr = Array.isArray(raw && raw.dados) ? raw.dados : [];
  const vistos = new Set();
  for (const r of arr) {
    const nome = N.txt(r.name);
    const email = N.txt(r.email);
    const doc = N.digitos(r.identity);
    const chave = [nome, email, doc].join('|');
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    p.compras.push({
      Nome: nome,
      Email: email ? email.toLowerCase() : null,
      Documento: doc,
      Telefone: N.digitos(r.telephone),
      DataNascimento: N.data(r.birthday),
      Data: N.data(r.created_at),
    });
    if (email) p.emails.push({ Email: email.toLowerCase(), Score: null, Status: null, Estrutura: null, Blacklist: false, Desde: null });
  }
  return p;
}

// ───────────────────────── api_full: registro rico (results[]) ─────────────────────────
function mapApiFullRich(raw) {
  const p = emptyPartial('api_full');
  const arr = Array.isArray(raw && raw.results) ? raw.results : [];
  const r = arr.find((x) => x && (x.CPF || x.NOME)) || arr[0];
  if (!r) return p;

  const obito = N.txt(r.FLAG_OBITO) === '1';
  p.basic = {
    Nome: N.txt(r.NOME),
    CPF: N.digitos(r.CPF),
    DataNascimento: N.data(r.DT_NASCIMENTO),
    Sexo: N.sexo(r.SEXO),
    Mae: N.txt(r.NOME_MAE),
    Falecido: obito,
    DataFalecimento: obito ? N.data(r.DT_OBITO) : null,
    Renda: N.moeda(N.num(r.RENDA_PRESUMIDA)),
  };
  const email = N.txt(r.EMAIL);
  if (email) p.emails.push({ Email: email.toLowerCase(), Score: null, Status: null, Estrutura: null, Blacklist: false, Desde: null });

  const rua = [N.txt(r.TIPO_ENDERECO), N.txt(r.LOGRADOURO)].filter(Boolean).join(' ') || null;
  if (rua || N.txt(r.CIDADE) || N.digitos(r.CEP)) {
    p.enderecos.push({
      Rua: rua, Numero: N.txt(r.NUMERO), Complemento: N.txt(r.COMPLEMENTO),
      Bairro: N.txt(r.BAIRRO), Cidade: N.txt(r.CIDADE), Estado: N.txt(r.UF),
      CEP: N.digitos(r.CEP), Desde: null, Atualizado: null,
    });
  }

  // Veículos numerados: MARCA_VEICULO1..5 / MODELO_VEICULO1..5 / ANO_VEICULO1..5
  for (let i = 1; i <= 5; i++) {
    const marca = N.txt(r['MARCA_VEICULO' + i]);
    const modelo = N.txt(r['MODELO_VEICULO' + i]);
    const ano = N.txt(r['ANO_VEICULO' + i]);
    if (marca || modelo) p.veiculos.push({ Marca: marca, Modelo: modelo, AnoModelo: ano, Fonte: 'api_full' });
  }

  const sit = N.txt(r.STATUS_RECEITA_FEDERAL);
  if (sit) p.situacao = { Status: sit, Fonte: 'Receita Federal' };
  if (N.txt(r.CBO)) p.tecnicos['CBO (ocupação)'] = N.txt(r.CBO);
  return p;
}

// ───────────────────────── cadsus simples ({cpf,nome,sexo,nascimento}) ─────────────────────────
function mapCadsusSimples(raw) {
  const p = emptyPartial('cadsus');
  const arr = Array.isArray(raw && raw.dados) ? raw.dados : [];
  const r = arr[0];
  if (!r) return p;
  p.basic = {
    Nome: N.txt(r.nome),
    CPF: N.digitos(r.cpf),
    Sexo: N.sexo(r.sexo),
    DataNascimento: N.data(r.nascimento),
  };
  return p;
}

// ───────────────────────── situacao.php ─────────────────────────
function mapSituacao(raw) {
  const p = emptyPartial('situacao');
  if (!raw) return p;
  const d = raw.dados || raw.resultado || raw;
  const status = N.txt(d.situacao || d.status_cpf || d.SITUACAO || d.descricao);
  const nome = N.txt(d.nome || d.NOME);
  if (nome) p.basic.Nome = nome;
  if (N.digitos(d.cpf || d.CPF)) p.basic.CPF = N.digitos(d.cpf || d.CPF);
  if (status && !/^\d+$/.test(status)) p.situacao = { Status: status, Fonte: 'Receita Federal' };
  return p;
}

// ─────────────────────────────────────────────────────────────────────────────
// Detector de formato: recebe um objeto já parseado e escolhe o mapper certo.
// Usado para desembrulhar o api_full (cada dados[].conteudo é uma fonte diferente).
// ─────────────────────────────────────────────────────────────────────────────
function detectAndMap(obj) {
  if (!obj || typeof obj !== 'object') return null;

  if (obj.resultado && obj.resultado.dados) return mapSerasa(obj);
  if (obj.resultado && (obj.resultado.telefone || obj.resultado.cpf) && !obj.resultado.dados) return mapTelefoneSimples(obj);
  if (obj.dados && obj.dados.name) return mapDados01(obj);

  if (Array.isArray(obj.results) && obj.results[0]) {
    const r0 = obj.results[0];
    if ('QT_VEICULOS' in r0 || 'STATUS_RECEITA_FEDERAL' in r0 || 'LOGRADOURO' in r0) return mapApiFullRich(obj);
    return null; // outras tabelas results[] (claro/nextel vazias) — ignora
  }

  if (Array.isArray(obj.data) && obj.data[0] && (obj.data[0].PLACA || obj.data[0].CHASSI)) {
    return obj.data[0].ID_EMPL ? mapCredautoEmpl(obj) : mapCredautoBin(obj);
  }

  if (Array.isArray(obj.resultados) && obj.resultados[0]) {
    const r0 = obj.resultados[0];
    if (r0.placa || r0.chassi) return mapSpc2Veic(obj);
    if (r0.doc || r0.fone) return mapSpc1(obj);
  }

  if (Array.isArray(obj.dados) && obj.dados[0]) {
    const r0 = obj.dados[0];
    if (r0.buyer_id || r0.service_used_id) return mapCompras(obj);
    if (r0.imagem) return mapFoto(obj);
    if (r0.placa || r0.propri) return mapDetran(obj);
    if (r0.nascimento && r0.nome) return mapCadsusSimples(obj);
  }
  return null;
}

// ───────────────────────── api_full (meta-agregador) ─────────────────────────
// Retorna um ARRAY de partials — o orquestrador achata na lista geral.
function mapApiFull(raw) {
  const out = [];
  const arr = Array.isArray(raw && raw.dados) ? raw.dados : [];
  for (const item of arr) {
    const obj = parseLoose(item && item.conteudo);
    const partial = detectAndMap(obj);
    if (partial) { partial.fonte = 'api_full:' + partial.fonte; out.push(partial); }
  }
  return out;
}

module.exports = {
  emptyPartial,
  mapSerasa, mapDados01, mapFoto, mapSpc1, mapTelefoneSimples,
  mapSpc2Veic, mapDetran, mapCredautoBin, mapCredautoEmpl,
  mapCompras, mapApiFullRich, mapCadsusSimples, mapSituacao,
  mapApiFull, detectAndMap,
};
