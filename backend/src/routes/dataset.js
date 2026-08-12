const router = require('express').Router();
const search = require('../services/searchService');

// POST /api/public/dataset/people/basic/v2  — rota pública (sem JWT, sem reCAPTCHA)
router.post('/people/basic/v2', async (req, res) => {
  const { name, doc, email, phone } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  let rows = [];
  let tipoBusca = '';
  let termoBusca = '';

  try {
    if (doc) {
      tipoBusca = 'cpf';
      termoBusca = doc;
      rows = await search.buscarPorCpf(doc);
    } else if (name) {
      tipoBusca = 'nome';
      termoBusca = name;
      rows = await search.buscarPorNome(name);
    } else if (email) {
      tipoBusca = 'email';
      termoBusca = email;
      rows = await search.buscarPorEmail(email);
    } else if (phone) {
      tipoBusca = 'telefone';
      termoBusca = phone;
      rows = await search.buscarPorTelefone(phone);
    } else {
      return res.status(400).json({ status: 'error', message: 'Informe ao menos um parâmetro de busca' });
    }

    // Fallback: se DB interno vazio, tenta API externa (CPF / email / telefone / rg)
    if (rows.length === 0) {
      const rawExt = await search.buscarViaApiExterna(tipoBusca, termoBusca);
      const resultadoExt = search.mapearRespostaExterna(rawExt);

      if (resultadoExt.length > 0) {
        const activityId = await search.registrarAtividade(termoBusca, tipoBusca, ip);
        return res.json({
          Result: resultadoExt,
          censored: true,
          search_activity_id: activityId,
          fonte: 'externa',
        });
      }

      return res.json({ status: 'not_found' });
    }

    // Registra a atividade e guarda o ID para o checkout depois
    const activityId = await search.registrarAtividade(termoBusca, tipoBusca, ip);

    const resultado = search.formatarResultado(rows);

    return res.json({
      Result: resultado,
      censored: true,           // dados parciais — desbloqueio via checkout
      search_activity_id: activityId,
    });
  } catch (err) {
    console.error('Erro na busca:', err);
    return res.status(500).json({ status: 'error', message: 'Erro interno' });
  }
});

module.exports = router;
