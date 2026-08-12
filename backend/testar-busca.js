// Testa a conexão e as 4 buscas direto no banco, sem subir o servidor.
// Rode com: node testar-busca.js
require('dotenv').config();
const search = require('./src/services/searchService');
const pool = require('./src/db/connection');

async function main() {
  const casos = [
    ['Nome (sem acento, parcial)', () => search.buscarPorNome('joao silva')],
    ['Nome (palavras separadas)',  () => search.buscarPorNome('jose ferreira')],
    ['Nome (erro de digitação)',   () => search.buscarPorNome('maria aparecida oliveria')],
    ['CPF',                        () => search.buscarPorCpf('222.333.444-57')],
    ['Email',                      () => search.buscarPorEmail('anapaula@email.com')],
    ['Telefone',                   () => search.buscarPorTelefone('(11) 98765-4321')],
  ];

  for (const [label, fn] of casos) {
    try {
      const rows = await fn();
      const nomes = rows.map((r) => r.nome).join(', ') || '(nenhum resultado)';
      console.log(`✓ ${label.padEnd(30)} → ${nomes}`);
    } catch (err) {
      console.log(`✗ ${label.padEnd(30)} → ERRO: ${err.message}`);
    }
  }

  // Mostra como fica o JSON que o frontend recebe
  const rows = await search.buscarPorNome('joao silva');
  console.log('\nJSON retornado ao frontend:');
  console.log(JSON.stringify({ Result: search.formatarResultado(rows), censored: true }, null, 2));

  await pool.end();
}

main().catch((e) => {
  console.error('Falhou:', e.message);
  process.exit(1);
});
