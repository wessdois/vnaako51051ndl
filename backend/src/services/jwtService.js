const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '2h';

function gerar(payload = {}) {
  return jwt.sign(
    {
      iss: 'app.buscaprime.com.br',
      aud: 'app.buscaprime.com.br',
      ...payload,
    },
    SECRET,
    { expiresIn: EXPIRES_IN }
  );
}

function verificar(token) {
  return jwt.verify(token, SECRET, {
    issuer: 'app.buscaprime.com.br',
    audience: 'app.buscaprime.com.br',
  });
}

module.exports = { gerar, verificar };
