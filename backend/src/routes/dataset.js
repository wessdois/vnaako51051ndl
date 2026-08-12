const router = require('express').Router();
const { buscar, mapear } = require('../services/searchService');

router.post('/people/basic/v2', async (req, res) => {
  const { name, doc, email, phone } = req.body;

  let tipo, valor;
  if (doc)        { tipo = 'cpf';      valor = doc; }
  else if (name)  { tipo = 'nome';     valor = name; }
  else if (email) { tipo = 'email';    valor = email; }
  else if (phone) { tipo = 'telefone'; valor = phone; }
  else return res.status(400).json({ status: 'error', message: 'Informe ao menos um parâmetro' });

  try {
    const raw      = await buscar(tipo, valor);
    const resultado = mapear(raw);

    if (!resultado.length) return res.json({ status: 'not_found' });
    return res.json({ Result: resultado, censored: true });
  } catch (err) {
    console.error('Erro:', err.message);
    return res.status(500).json({ status: 'error', message: 'Erro interno' });
  }
});

module.exports = router;
