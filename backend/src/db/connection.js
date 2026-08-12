const { Pool } = require('pg');

// Supabase recomenda DATABASE_URL (connection string com SSL embutido).
// Se não tiver, usa as vars separadas como fallback.
const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }, // Supabase pooler usa cert auto-assinado
    }
  : {
      host:     process.env.DB_HOST,
      port:     parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME,
      user:     process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl:      { rejectUnauthorized: false },
    };

const pool = new Pool({
  ...poolConfig,
  max:                10,
  idleTimeoutMillis:  30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('[DB] Erro inesperado no pool Supabase:', err.message);
});

module.exports = pool;
