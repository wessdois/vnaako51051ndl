require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const authRoutes       = require('./routes/auth');
const datasetRoutes    = require('./routes/dataset');
const landingpageRoutes = require('./routes/landingpage');
const checkoutRoutes   = require('./routes/checkout');

const app = express();

app.use(cors({ origin: process.env.BASE_URL || '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limit geral: 100 req/min por IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { status: 'error', message: 'Muitas requisições. Tente novamente em breve.' },
});
app.use(limiter);

// Rate limit mais restrito nas buscas: 10 por minuto por IP
const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { status: 'error', message: 'Limite de buscas atingido.' },
});

// Rotas
app.use('/api/auth', authRoutes);
app.use('/api/public/dataset', searchLimiter, datasetRoutes);
app.use('/api/landingpage', landingpageRoutes);
app.use('/checkout', checkoutRoutes);
app.use('/api/checkout', checkoutRoutes);

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`BuscaPrime backend rodando na porta ${PORT}`);
});
