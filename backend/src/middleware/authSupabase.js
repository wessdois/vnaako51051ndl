const jwt = require('jsonwebtoken');

// Extrai o usuário do JWT do Supabase (sem rejeitar a request se não tiver token)
module.exports = function extractUser(req, _res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  req.user = null;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET, { algorithms: ['HS256'] });
      req.user = { id: decoded.sub, email: decoded.email };
    } catch { /* token inválido → anônimo */ }
  }
  next();
};
