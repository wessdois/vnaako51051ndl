// normalize.js — helpers de limpeza/formatação compartilhados pelos mappers.
// A fonte (apisbrasilpro.site) devolve dados sujos: acentos corrompidos (U+FFFD),
// "NULL"/"False" como string, datas em formatos variados, números com vírgula, etc.

// Remove lixo textual. Devolve null para vazios/sentinelas.
function txt(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/�/g, '').replace(/\s+/g, ' ').trim();
  if (!s || /^(NULL|null|False|false|nenhum|undefined)$/.test(s)) return null;
  return s;
}

// Lê uma chave tolerando maiúsculas/minúsculas.
function g(obj, key) {
  if (!obj) return null;
  return txt(obj[key] ?? obj[key.toUpperCase()] ?? obj[key.toLowerCase()]);
}

// "2019-11-22 00:00:00" | "22/11/2019" | "18/04/2002" | "20060320" -> "2019-11-22"
function data(s) {
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
  // "yy/mm/dd" (credauto: 30/05/14) — assume 20xx
  if (/^\d{2}\/\d{2}\/\d{2}$/.test(str)) {
    const [d, m, y] = str.split('/');
    return `20${y}-${m}-${d}`;
  }
  // "20060320" -> 2006-03-20
  if (/^\d{8}$/.test(str)) {
    return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`;
  }
  return null;
}

// "9002,16" | "9002.1568" -> 9002.16
function num(v) {
  const s = txt(v);
  if (!s) return null;
  const n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function moeda(n) {
  if (n === null || n === undefined) return null;
  return 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// "De R$ 7017 at? R$ 11742" -> "De R$ 7.017 até R$ 11.742"
function faixa(s) {
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

// Combustível codificado da fonte veicular (COD_COMBUST).
const COMBUSTIVEL = {
  1: 'Álcool', 2: 'Gasolina', 3: 'Diesel', 4: 'Gás', 5: 'Flex',
  6: 'Elétrico', 8: 'Gasolina/GNV', 16: 'Flex/GNV',
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

// Normaliza sexo para 'M'/'F' a partir de "M", "M - Masculino", "Masculino"...
function sexo(v) {
  const s = txt(v);
  if (!s) return null;
  const c = s[0].toUpperCase();
  return c === 'M' || c === 'F' ? c : null;
}

// Só os dígitos, ou null se vazio.
function digitos(v) {
  const s = txt(v);
  if (!s) return null;
  const d = s.replace(/\D/g, '');
  return d || null;
}

module.exports = {
  txt, g, data, num, moeda, faixa, idadeDe, sexo, digitos,
  ESTADO_CIVIL, VINCULO, COMBUSTIVEL,
};
