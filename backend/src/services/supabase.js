const axios = require('axios');

const BASE = () => process.env.SUPABASE_URL + '/rest/v1';

function adminHeaders(extra) {
  return {
    apikey: process.env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function getCredits(userId) {
  try {
    const { data } = await axios.get(`${BASE()}/user_credits`, {
      headers: adminHeaders(),
      params: { user_id: `eq.${userId}`, select: 'credits_remaining' },
    });
    return data[0]?.credits_remaining ?? 0;
  } catch (err) {
    console.error('[supabase] getCredits:', err.message);
    return 0;
  }
}

async function deductCredit(userId) {
  try {
    const { data } = await axios.post(
      process.env.SUPABASE_URL + '/rest/v1/rpc/deduct_credit',
      { p_user_id: userId },
      { headers: adminHeaders() },
    );
    return data; // saldo restante ou -1
  } catch (err) {
    console.error('[supabase] deductCredit:', err.message);
    return -1;
  }
}

async function saveHistory(userId, searchType, searchValue, resultJson) {
  try {
    await axios.post(
      `${BASE()}/search_history`,
      { user_id: userId, search_type: searchType, search_value: searchValue, result_json: resultJson },
      { headers: adminHeaders({ Prefer: 'return=minimal' }) },
    );
  } catch (err) {
    console.error('[supabase] saveHistory:', err.message);
  }
}

async function createPurchase({ userId, sku, credits, amount, payerName, payerDocument }) {
  const { data } = await axios.post(
    `${BASE()}/purchases`,
    {
      user_id: userId,
      sku,
      credits,
      amount,
      payer_name: payerName,
      payer_document: payerDocument,
    },
    { headers: adminHeaders({ Prefer: 'return=representation' }) },
  );
  return data[0];
}

async function updatePurchase(id, campos) {
  try {
    await axios.patch(`${BASE()}/purchases`, campos, {
      headers: adminHeaders({ Prefer: 'return=minimal' }),
      params: { id: `eq.${id}` },
    });
  } catch (err) {
    console.error('[supabase] updatePurchase:', err.message);
  }
}

async function getPurchase(id) {
  try {
    const { data } = await axios.get(`${BASE()}/purchases`, {
      headers: adminHeaders(),
      params: { id: `eq.${id}`, select: '*' },
    });
    return data[0] || null;
  } catch (err) {
    console.error('[supabase] getPurchase:', err.message);
    return null;
  }
}

// Dados do pagador da última compra confirmada — usados para preencher o
// checkout nas próximas vezes. Só compras pagas contam: assim um CPF digitado
// errado numa tentativa abandonada não volta para assombrar o usuário.
async function getUltimoPagador(userId) {
  try {
    const { data } = await axios.get(`${BASE()}/purchases`, {
      headers: adminHeaders(),
      params: {
        user_id: `eq.${userId}`,
        status: 'eq.paid',
        select: 'payer_name,payer_document',
        order: 'paid_at.desc',
        limit: 1,
      },
    });
    return data[0] || null;
  } catch (err) {
    console.error('[supabase] getUltimoPagador:', err.message);
    return null;
  }
}

// Credita a compra de forma atômica. Saldo final, ou -1 (não existe) / -2 (já creditada).
async function creditPurchase(id) {
  const { data } = await axios.post(
    `${BASE()}/rpc/credit_purchase`,
    { p_purchase_id: id },
    { headers: adminHeaders() },
  );
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Registro de buscas (grátis e pagas) — alimenta as métricas do painel admin.
// Tolerante: se a tabela search_logs ainda não existir, não trava a busca.
// ─────────────────────────────────────────────────────────────────────────────
async function logSearch({ userId, tipo, gratis }) {
  try {
    await axios.post(
      `${BASE()}/search_logs`,
      { user_id: userId || null, tipo: tipo || null, gratis: !!gratis },
      { headers: adminHeaders({ Prefer: 'return=minimal' }) },
    );
  } catch (err) {
    // Silencioso de propósito: métrica não pode derrubar a funcionalidade.
  }
}

// Conta linhas de uma tabela via header content-range (Prefer: count=exact).
async function countRows(table, selectCol, filtro) {
  try {
    const resp = await axios.get(`${BASE()}/${table}`, {
      headers: adminHeaders({ Prefer: 'count=exact', Range: '0-0' }),
      params: { select: selectCol, ...(filtro || {}) },
    });
    const cr = resp.headers['content-range'] || '*/0';
    return parseInt(cr.split('/')[1], 10) || 0;
  } catch (err) {
    console.error(`[admin] countRows ${table}:`, err.message);
    return 0;
  }
}

async function searchStats() {
  const hoje = new Date().toISOString().slice(0, 10);
  const total  = await countRows('search_logs', 'id');
  const gratis = await countRows('search_logs', 'id', { gratis: 'is.true' });
  const hojeN  = await countRows('search_logs', 'id', { created_at: `gte.${hoje}` });
  return { total, gratis, pagas: Math.max(0, total - gratis), hoje: hojeN };
}

async function adminMetrics() {
  const usuarios     = await countRows('user_credits', 'user_id');
  const vendasPagas  = await countRows('purchases', 'id', { status: 'eq.paid' });
  const vendasPend   = await countRows('purchases', 'id', { status: 'eq.pending' });

  let faturamento = 0;
  try {
    const { data } = await axios.get(`${BASE()}/purchases`, {
      headers: adminHeaders(),
      params: { select: 'amount', status: 'eq.paid' },
    });
    faturamento = (data || []).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  } catch (err) {
    console.error('[admin] faturamento:', err.message);
  }

  const buscas = await searchStats();
  return {
    usuarios,
    vendas: { pagas: vendasPagas, pendentes: vendasPend, faturamento: Math.round(faturamento * 100) / 100 },
    buscas,
  };
}

async function adminListUsers(limit = 50) {
  try {
    const { data } = await axios.get(`${process.env.SUPABASE_URL}/auth/v1/admin/users`, {
      headers: adminHeaders(),
      params: { per_page: limit },
    });
    const users = (data && data.users) || [];

    const { data: creds } = await axios.get(`${BASE()}/user_credits`, {
      headers: adminHeaders(),
      params: { select: 'user_id,credits_remaining' },
    });
    const mapa = {};
    (creds || []).forEach((c) => { mapa[c.user_id] = c.credits_remaining; });

    return users.map((u) => ({
      id: u.id,
      email: u.email,
      criado: u.created_at,
      ultimoLogin: u.last_sign_in_at,
      creditos: mapa[u.id] ?? 0,
    }));
  } catch (err) {
    console.error('[admin] adminListUsers:', err.message);
    return [];
  }
}

async function adminListSales(limit = 50) {
  try {
    const { data } = await axios.get(`${BASE()}/purchases`, {
      headers: adminHeaders(),
      params: {
        select: 'id,sku,credits,amount,status,payer_name,created_at,paid_at',
        order: 'created_at.desc',
        limit,
      },
    });
    return data || [];
  } catch (err) {
    console.error('[admin] adminListSales:', err.message);
    return [];
  }
}

module.exports = {
  getCredits,
  deductCredit,
  saveHistory,
  createPurchase,
  updatePurchase,
  getPurchase,
  getUltimoPagador,
  creditPurchase,
  logSearch,
  adminMetrics,
  adminListUsers,
  adminListSales,
};
