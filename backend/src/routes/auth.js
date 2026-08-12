const router = require('express').Router();
const { gerar } = require('../services/jwtService');

// Rota interna para gerar access_token
// Proteja isso com uma chave de servidor em produção
router.post('/token', (req, res) => {
  const serverKey = req.headers['x-server-key'];

  if (serverKey !== process.env.SERVER_KEY) {
    return res.status(403).json({ error: 'Não autorizado' });
  }

  const token = gerar();
  res.json({ access_token: token });
});

module.exports = router;
