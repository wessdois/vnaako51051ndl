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

module.exports = { getCredits, deductCredit, saveHistory };
