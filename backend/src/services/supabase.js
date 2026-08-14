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

module.exports = {
  getCredits,
  deductCredit,
  saveHistory,
  createPurchase,
  updatePurchase,
  getPurchase,
  getUltimoPagador,
  creditPurchase,
};
