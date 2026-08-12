const axios = require('axios');

async function validarRecaptcha(req, res, next) {
  const token = req.headers['token'];

  if (!token) {
    return res.status(400).json({ status: 'error', message: 'reCAPTCHA token ausente' });
  }

  try {
    const { data } = await axios.post(
      `https://recaptchaenterprise.googleapis.com/v1/projects/${process.env.RECAPTCHA_PROJECT_ID}/assessments?key=${process.env.RECAPTCHA_SECRET}`,
      {
        event: {
          token,
          expectedAction: 'submit',
          siteKey: '6Lc7ya0qAAAAAFIT2iBWa_cGr6W0t6hGyUxJbfQ_',
        },
      }
    );

    const score = data?.riskAnalysis?.score ?? 0;

    // Score abaixo de 0.5 é suspeito de bot
    if (score < 0.5) {
      return res.status(403).json({ status: 'error', message: 'Verificação de segurança falhou' });
    }

    next();
  } catch (err) {
    // Em desenvolvimento pode deixar passar; em produção rejeite
    if (process.env.NODE_ENV === 'production') {
      return res.status(500).json({ status: 'error', message: 'Erro ao validar reCAPTCHA' });
    }
    next();
  }
}

module.exports = validarRecaptcha;
