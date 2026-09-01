const router      = require('express').Router();
const extractUser = require('../middleware/authSupabase');
const db          = require('../services/supabase');

// Lista de admins por e-mail (config via ADMIN_EMAILS, separados por vírgula).
// Nada de senha em código: o admin loga normal pelo Supabase e o acesso é
// liberado apenas se o e-mail do token estiver nesta lista.
const ADMINS = (process.env.ADMIN_EMAILS || 'cauawess79@gmail.com')
  .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

function ehAdmin(req) {
  const email = ((req.user && req.user.email) || '').toLowerCase();
  return !!req.user && ADMINS.includes(email);
}

function requireAdmin(req, res, next) {
  if (!ehAdmin(req)) return res.status(403).json({ status: 'error', message: 'Acesso restrito ao administrador.' });
  next();
}

// O frontend usa isto pra decidir se mostra o painel ou "acesso negado".
router.get('/whoami', extractUser, (req, res) => {
  res.json({ admin: ehAdmin(req), email: (req.user && req.user.email) || null });
});

router.get('/metrics', extractUser, requireAdmin, async (_req, res) => {
  try {
    res.json(await db.adminMetrics());
  } catch (err) {
    console.error('[admin] metrics:', err.message);
    res.status(500).json({ status: 'error', message: 'Erro ao carregar métricas.' });
  }
});

router.get('/users', extractUser, requireAdmin, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  res.json({ users: await db.adminListUsers(limit) });
});

router.get('/sales', extractUser, requireAdmin, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  res.json({ sales: await db.adminListSales(limit) });
});

module.exports = router;
