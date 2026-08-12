const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const axios  = require('axios');

// Cache das chaves públicas do Supabase (JWKS), recarregadas a cada 10 min
let jwksCache = { keys: {}, fetchedAt: 0 };
const JWKS_TTL = 10 * 60 * 1000;

async function getPublicKey(kid) {
  const agora = Date.now();

  if (jwksCache.keys[kid] && agora - jwksCache.fetchedAt < JWKS_TTL) {
    return jwksCache.keys[kid];
  }

  const { data } = await axios.get(
    process.env.SUPABASE_URL + '/auth/v1/.well-known/jwks.json',
    { timeout: 5000 },
  );

  const keys = {};
  for (const jwk of data.keys || []) {
    try {
      keys[jwk.kid] = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    } catch (err) {
      console.error('[auth] JWK inválida:', jwk.kid, err.message);
    }
  }
  jwksCache = { keys, fetchedAt: agora };

  return keys[kid] || null;
}

// Extrai o usuário do JWT do Supabase — não rejeita a request, só marca req.user
module.exports = async function extractUser(req, _res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  req.user = null;

  if (!token) return next();

  try {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded) return next();

    const { alg, kid } = decoded.header;
    let payload;

    if (alg === 'HS256') {
      // Projetos legados com segredo compartilhado
      payload = jwt.verify(token, process.env.SUPABASE_JWT_SECRET, { algorithms: ['HS256'] });
    } else {
      // Padrão atual do Supabase: ES256/RS256 com chave pública do JWKS
      const pub = await getPublicKey(kid);
      if (!pub) return next();
      payload = jwt.verify(token, pub, { algorithms: ['ES256', 'RS256'] });
    }

    req.user = { id: payload.sub, email: payload.email };
  } catch (err) {
    if (err.name !== 'TokenExpiredError' && err.name !== 'JsonWebTokenError') {
      console.error('[auth] erro ao validar token:', err.message);
    }
  }

  next();
};
