const { verificar } = require('../services/jwtService');

function autenticar(req, res, next) {
  const token = req.headers['access_token'];

  if (!token) {
    return res.status(401).json({ status: 'error', message: 'access_token ausente' });
  }

  try {
    req.tokenPayload = verificar(token);
    next();
  } catch (err) {
    return res.status(401).json({ status: 'error', message: 'access_token inválido ou expirado' });
  }
}

module.exports = autenticar;
