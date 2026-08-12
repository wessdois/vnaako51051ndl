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

function _g(obj, key) {
  return obj[key] || obj[key.toUpperCase()] || obj[key.toLowerCase()] || null;
}

function _data(s) {
  if (!s || !String(s).trim()) return null;
  const str = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  if (/^\d{2}\/\d{2}\/\d{4}/.test(str)) {
    const [d, m, y] = str.split('/');
    return `${y}-${m}-${d}`;
  }
  return null;
}

function mapear(raw) {
  if (!raw || !raw.sucesso || !raw.resultado || !raw.resultado.dados) return [];

  const res  = raw.resultado;
  const d    = res.dados;

  const cpf  = _g(d, 'cpf');
  const nome = _g(d, 'nome');
  if (!nome && !cpf) return [];

  const nasc = _data(_g(d, 'nasc') || _g(d, 'data_nascimento'));
  let idade  = null;
  if (nasc) {
    const hoje = new Date(), n = new Date(nasc);
    idade = hoje.getFullYear() - n.getFullYear();
    const dm = hoje.getMonth() - n.getMonth();
    if (dm < 0 || (dm === 0 && hoje.getDate() < n.getDate())) idade--;
  }

  const enderecos = (res.enderecos || []).map(e => ({
    Rua:         [e.LOGR_TIPO, e.LOGR_NOME].filter(Boolean).join(' ') || null,
    Numero:      e.LOGR_NUMERO      || null,
    Complemento: e.LOGR_COMPLEMENTO || null,
    Bairro:      e.BAIRRO           || null,
    Cidade:      e.CIDADE           || null,
    Estado:      e.UF               || null,
    CEP:         e.CEP              || null,
  }));

  const fones = (res.telefone || [])
    .map(t => String(t.DDD || '') + String(t.TELEFONE || ''))
    .filter(Boolean);
  const cel = fones.find(n => n.length >= 10 && n[2] === '9') || fones[0] || null;
  const tel = fones.find(n => n !== cel) || null;

  const emails = (res.email || [])
    .sort((a, b) => (a.PRIORIDADE || 99) - (b.PRIORIDADE || 99))
    .map(e => e.EMAIL).filter(Boolean);

  const pa = (res.poder_aquisitivo || [])[0];

  return [{
    BasicData: {
      Nome:           nome,
      CPF:            cpf ? cpf.replace(/\D/g, '') : null,
      CNS:            _g(d, 'cns'),
      DataNascimento: nasc,
      Idade:          idade,
      Sexo:           _g(d, 'sexo'),
      RacaCor:        _g(d, 'raca_cor'),
      Falecido:       !!(d.DT_OB && String(d.DT_OB).trim()),
      DataFalecimento:_data(d.DT_OB),
      Mae:            _g(d, 'nome_mae'),
      Pai:            _g(d, 'nome_pai'),
      Renda:          pa ? (pa.RENDA_PODER_AQUISITIVO || pa.FX_PODER_AQUISITIVO || null) : null,
    },
    Documentos: {
      RG:             _g(d, 'rg'),
      RGOrgaoEmissor: d.ORGAO_EMISSOR || null,
      RGDataEmissao:  null,
      NIS:            (res.pis || [])[0] ? String((res.pis[0]).PIS) : null,
    },
    Contatos: {
      Celular:  cel,
      Telefone: tel,
      Contato:  null,
      Emails:   emails,
    },
    Enderecos: enderecos,
  }];
}

module.exports = { buscar, mapear };
