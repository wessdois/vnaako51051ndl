const router = require('express').Router();
const pool = require('../db/connection');

// GET /checkout/:hash  →  redireciona para URL da MisticPay
router.get('/:hash', async (req, res) => {
  const { hash } = req.params;

  try {
    const { rows } = await pool.query(
      `SELECT checkout_url, pago FROM leads WHERE hash = $1`,
      [hash]
    );

    if (rows.length === 0) {
      return res.status(404).send('Link de pagamento não encontrado.');
    }

    const lead = rows[0];

    if (lead.pago) {
      return res.redirect(`${process.env.BASE_URL}/checkout/sucesso/${hash}`);
    }

    if (!lead.checkout_url) {
      return res.status(500).send('Link de pagamento não disponível.');
    }

    return res.redirect(lead.checkout_url);
  } catch (err) {
    console.error('Erro no checkout:', err);
    return res.status(500).send('Erro interno.');
  }
});

// POST /api/checkout/callback  →  webhook da MisticPay confirmando pagamento
router.post('/callback', async (req, res) => {
  // Ajuste os campos conforme o payload real da MisticPay
  const { external_id, status } = req.body;

  if (status !== 'paid' && status !== 'approved') {
    return res.sendStatus(200);
  }

  try {
    await pool.query(
      `UPDATE leads SET pago = TRUE WHERE id = $1`,
      [external_id]
    );

    // Aqui: liberar acesso ao relatório completo do usuário
    // ex: gerar token de acesso, enviar email, etc.

    return res.sendStatus(200);
  } catch (err) {
    console.error('Erro no callback de pagamento:', err);
    return res.sendStatus(500);
  }
});

module.exports = router;
