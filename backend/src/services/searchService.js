const axios = require('axios');

const API = 'http://apisbrasilpro.site/consulta_serasa.php';
const PARAM = { cpf: 'cpf', email: 'email', telefone: 'telefone', rg: 'rg' };

async function buscar(tipo, valor) {
  const param = PARAM[tipo];
  if (!param) return null;

  const limpo = ['cpf', 'telefone', 'rg'].includes(tipo)
    ? valor.replace(/\D/g, '')
    : valor.trim();

  try {
    const { data } = await axios.get(API, {
      params: { [param]: limpo },
      timeout: 12000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    return data;
  } catch (err) {
    console.error('[API] erro:', err.message);
    return null;
  }
}

// ---------- helpers ----------

// A API devolve alguns acentos já corrompidos (U+FFFD). Remove o lixo.
function txt(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/�/g, '').replace(/\s+/g, ' ').trim();
  if (!s || s === 'NULL' || s === 'null' || s === 'False') return null;
  return s;
}

function _g(obj, key) {
  if (!obj) return null;
  return txt(obj[key] ?? obj[key.toUpperCase()] ?? obj[key.toLowerCase()]);
}

// "2019-11-22 00:00:00" | "22/11/2019" -> "2019-11-22"
function _data(s) {
  const str = txt(s);
  if (!str) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const d = str.slice(0, 10);
    return d === '0000-00-00' ? null : d;
  }
  if (/^\d{2}\/\d{2}\/\d{4}/.test(str)) {
    const [d, m, y] = str.slice(0, 10).split('/');
    return `${y}-${m}-${d}`;
  }
  return null;
}

// "9002,16" | "9002.1568292979" -> 9002.16
function _num(v) {
  const s = txt(v);
  if (!s) return null;
  const n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function _moeda(n) {
  if (n === null) return null;
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// "De R$ 7017 at? R$ 11742" -> "De R$ 7.017 até R$ 11.742"
function _faixa(s) {
  const str = txt(s);
  if (!str) return null;
  const nums = str.match(/\d[\d.,]*/g);
  if (nums && nums.length >= 2) {
    const fmt = (x) => parseInt(x.replace(/\D/g, ''), 10).toLocaleString('pt-BR');
    return `De R$ ${fmt(nums[0])} até R$ ${fmt(nums[1])}`;
  }
  return str;
}

const ESTADO_CIVIL = {
  S: 'Solteiro(a)', C: 'Casado(a)', D: 'Divorciado(a)',
  V: 'Viúvo(a)', A: 'Separado(a)', O: 'Outro',
};

const VINCULO = {
  MAE: 'Mãe', PAI: 'Pai', CONJUGE: 'Cônjuge', IRMAO: 'Irmão(ã)',
  FILHO: 'Filho(a)', AVO: 'Avô/Avó', TIO: 'Tio(a)', PRIMO: 'Primo(a)',
};

function idadeDe(nasc) {
  if (!nasc) return null;
  const hoje = new Date(), n = new Date(nasc);
  if (Number.isNaN(n.getTime())) return null;
  let i = hoje.getFullYear() - n.getFullYear();
  const dm = hoje.getMonth() - n.getMonth();
  if (dm < 0 || (dm === 0 && hoje.getDate() < n.getDate())) i--;
  return i >= 0 && i < 130 ? i : null;
}

// ---------- mapper ----------

function mapear(raw) {
  if (!raw || !raw.sucesso || !raw.resultado || !raw.resultado.dados) return [];

  const res = raw.resultado;
  const d   = res.dados;

  const cpf  = _g(d, 'CPF');
  const nome = _g(d, 'NOME');
  if (!nome && !cpf) return [];

  const nasc     = _data(d.NASC);
  const obito    = _data(d.DT_OB);
  const rendaNum = _num(d.RENDA);

  // ----- telefones -----
  const telefones = (res.telefone || []).map((t) => {
    const ddd  = txt(t.DDD) || '';
    const num  = txt(t.TELEFONE) || '';
    const full = (ddd + num).replace(/\D/g, '');
    if (!full) return null;
    const soNum = num.replace(/\D/g, '');
    return {
      Numero:    full,
      DDD:       ddd || null,
      Celular:   soNum.length === 9 && soNum.startsWith('9'),
      Desde:     _data(t.DT_INCLUSAO),
      Qualidade: txt(t.CLASSIFICACAO),
    };
  }).filter(Boolean);

  const cel = telefones.find((t) => t.Celular) || null;
  const fix = telefones.find((t) => !t.Celular) || null;

  // ----- e-mails -----
  const emails = (res.email || [])
    .slice()
    .sort((a, b) => (a.PRIORIDADE || 99) - (b.PRIORIDADE || 99))
    .map((e) => {
      const end = txt(e.EMAIL);
      if (!end) return null;
      return {
        Email:     end.toLowerCase(),
        Score:     txt(e.EMAIL_SCORE),
        Status:    txt(e.STATUS_VT),
        Estrutura: txt(e.ESTRUTURA),
        Blacklist: txt(e.BLACKLIST) === 'S',
        Desde:     _data(e.DT_INCLUSAO),
      };
    })
    .filter(Boolean);

  // ----- endereços -----
  const enderecos = (res.enderecos || []).map((e) => {
    const rua = [txt(e.LOGR_TIPO), txt(e.LOGR_NOME)].filter(Boolean).join(' ') || null;
    return {
      Rua:         rua,
      Numero:      txt(e.LOGR_NUMERO),
      Complemento: txt(e.LOGR_COMPLEMENTO),
      Bairro:      txt(e.BAIRRO),
      Cidade:      txt(e.CIDADE),
      Estado:      txt(e.UF),
      CEP:         txt(e.CEP),
      Desde:       _data(e.DT_INCLUSAO),
      Atualizado:  _data(e.DT_ATUALIZACAO),
    };
  }).filter((e) => e.Rua || e.Cidade || e.CEP);

  // ----- score de crédito -----
  const sc = (res.score || [])[0] || {};
  const scoreVal = _num(sc.CSBA) ?? _num(sc.CSB8);
  const score = scoreVal !== null ? {
    Valor: Math.round(scoreVal),
    Faixa: txt(sc.CSBA_FAIXA) || txt(sc.CSB8_FAIXA),
    Max:   1000,
  } : null;

  // ----- poder aquisitivo -----
  const pa = (res.poder_aquisitivo || [])[0] || {};
  const rendaPA = _num(pa.RENDA_PODER_AQUISITIVO);
  const poder = (txt(pa.PODER_AQUISITIVO) || rendaPA) ? {
    Classe: txt(pa.PODER_AQUISITIVO),
    Renda:  _moeda(rendaPA ?? rendaNum),
    Faixa:  _faixa(pa.FX_PODER_AQUISITIVO),
  } : null;

  // ----- parentes / vínculos -----
  const vistos = new Set();
  const parentes = (res.parentes || []).map((p) => {
    const nomeV = txt(p.NOME_VINCULO);
    if (!nomeV) return null;
    const chave = nomeV.toUpperCase();
    if (vistos.has(chave)) return null;
    vistos.add(chave);
    const tipo = (txt(p.VINCULO) || '').toUpperCase();
    return {
      Nome:    nomeV,
      Vinculo: VINCULO[tipo] || txt(p.VINCULO),
      CPF:     txt(p.CPF_VINCULO),
    };
  }).filter(Boolean);

  // ----- códigos brutos que não traduzimos (exibidos como técnicos) -----
  const tecnicos = {};
  const add = (k, v) => { const x = txt(v); if (x) tecnicos[k] = x; };
  add('CBO (ocupação)',        d.CBO);
  add('Situação cadastral',    d.CD_SIT_CAD);
  add('Mosaic',                d.CD_MOSAIC);
  add('Mosaic novo',           d.CD_MOSAIC_NOVO);
  add('Mosaic secundário',     d.CD_MOSAIC_SECUNDARIO);
  add('Faixa de renda (cód.)', d.FAIXA_RENDA_ID);
  add('ID do contato',         d.CONTATOS_ID);

  const estCiv = _g(d, 'ESTCIV');

  return [{
    BasicData: {
      Nome:            nome,
      CPF:             cpf ? cpf.replace(/\D/g, '') : null,
      DataNascimento:  nasc,
      Idade:           idadeDe(nasc),
      Sexo:            _g(d, 'SEXO'),
      EstadoCivil:     estCiv ? (ESTADO_CIVIL[estCiv] || estCiv) : null,
      Nacionalidade:   _g(d, 'NACIONALID'),
      Mae:             _g(d, 'NOME_MAE'),
      Pai:             _g(d, 'NOME_PAI'),
      Falecido:        !!obito,
      DataFalecimento: obito,
      Renda:           _moeda(rendaNum),
      CNS:             _g(d, 'CNS'),
      RacaCor:         _g(d, 'RACA_COR'),
      SituacaoDesde:   _data(d.DT_SIT_CAD),
    },
    Documentos: {
      RG:             _g(d, 'RG'),
      RGOrgaoEmissor: _g(d, 'ORGAO_EMISSOR'),
      RGUFEmissao:    _g(d, 'UF_EMISSAO'),
      TituloEleitor:  _g(d, 'TITULO_ELEITOR'),
      NIS:            txt((res.pis || [])[0]?.PIS),
    },
    Contatos: {
      Celular:   cel ? cel.Numero : null,
      Telefone:  fix ? fix.Numero : null,
      Telefones: telefones,
      Emails:    emails.map((e) => e.Email),
      EmailsDetalhe: emails,
    },
    Enderecos: enderecos,
    Score:     score,
    Poder:     poder,
    Parentes:  parentes,
    Tecnicos:  Object.keys(tecnicos).length ? tecnicos : null,
  }];
}

module.exports = { buscar, mapear };
