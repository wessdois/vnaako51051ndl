const router      = require('express').Router();
const { buscar, mapear } = require('../services/searchService');
const extractUser = require('../middleware/authSupabase');
const db          = require('../services/supabase');

router.post('/people/basic/v2', extractUser, async (req, res) => {
  const { doc, rg, email, phone } = req.body;

  let tipo, valor;
  if (doc)        { tipo = 'cpf';      valor = doc; }
  else if (rg)    { tipo = 'rg';       valor = rg; }
  else if (email) { tipo = 'email';    valor = email; }
  else if (phone) { tipo = 'telefone'; valor = phone; }
  else return res.status(400).json({ status: 'error', message: 'Informe ao menos um parâmetro' });

  const user = req.user;

  // Usuário logado: verifica créditos antes de chamar a API externa
  if (user) {
    const credits = await db.getCredits(user.id);
    if (credits <= 0) return res.json({ status: 'no_credits' });
  }

  try {
    const raw      = await buscar(tipo, valor);
    const resultado = mapear(raw);

    if (!resultado.length) return res.json({ status: 'not_found' });

    if (user) {
      // Dispara desconto + histórico em paralelo sem bloquear a resposta
      db.deductCredit(user.id).catch(() => {});
      db.saveHistory(user.id, tipo, valor, resultado).catch(() => {});
      return res.json({ Result: resultado, censored: false });
    }

    return res.json({ Result: resultado, censored: true });
  } catch (err) {
    console.error('Erro na busca:', err.message);
    return res.status(500).json({ status: 'error', message: 'Erro interno' });
  }
});

module.exports = router;
