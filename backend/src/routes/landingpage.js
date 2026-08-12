const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const autenticar = require('../middleware/auth');
const pool = require('../db/connection');
const { criarCheckout } = require('../services/misticpay');

// POST /api/landingpage/lead
// Chamado pelo openCheckout() no frontend
router.post('/lead', autenticar, async (req, res) => {
  const { sku, search_activity_id } = req.body;

  const utm_source   = req.headers['utm_source']   || null;
  const utm_medium   = req.headers['utm_medium']   || null;
  const utm_campaign = req.headers['utm_campaign'] || null;
  const origem       = req.headers['origem']       ? decodeURIComponent(req.headers['origem']) : null;

  if (!sku) {
    return res.json({ success: false, erro: 'SKU não informado' });
  }

  const hash = uuidv4().replace(/-/g, '');

  try {
    // Cria o lead no banco
    const { rows } = await pool.query(
      `INSERT INTO leads (hash, sku, search_activity_id, utm_source, utm_medium, utm_campaign, origem)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [hash, sku, search_activity_id || null, utm_source, utm_medium, utm_campaign, origem]
    );

    const leadId = rows[0].id;

    // Cria o checkout na MisticPay
    const checkoutUrl = await criarCheckout({ sku, leadId, hash });

    // Salva a URL gerada
    await pool.query(
      `UPDATE leads SET checkout_url = $1 WHERE id = $2`,
      [checkoutUrl, leadId]
    );

    return res.json({ success: true, hash });
  } catch (err) {
    console.error('Erro ao criar lead:', err);
    return res.json({ success: false, erro: 'Erro ao gerar link de pagamento' });
  }
});

module.exports = router;
