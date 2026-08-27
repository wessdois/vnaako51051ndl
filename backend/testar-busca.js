// Testa o fan-out de busca de ponta a ponta (faz chamadas reais à fonte).
// Rode com: node testar-busca.js [tipo] [valor]
//   ex.: node testar-busca.js cpf 60235209872
//        node testar-busca.js placa MNL9299
// Sem argumentos, roda uma bateria de casos padrão.
require('dotenv').config();
const { buscar } = require('./src/services/searchService');

async function um(tipo, valor) {
  const t0 = Date.now();
  try {
    const out = await buscar(tipo, valor);
    const ms = Date.now() - t0;
    if (!out.length) {
      console.log(`✗ ${tipo.padEnd(9)} ${String(valor).padEnd(20)} → nada encontrado (${ms}ms)`);
      return;
    }
    const r = out[0];
    const resumo = [
      r.BasicData.Nome || '(sem nome)',
      r.Contatos.Telefones.length + ' tel',
      r.Contatos.Emails.length + ' email',
      r.Enderecos.length + ' end',
      r.Veiculos.length + ' veic',
      r.Compras.length + ' compras',
      r.Foto ? 'foto' : '',
    ].filter(Boolean).join(' · ');
    console.log(`✓ ${tipo.padEnd(9)} ${String(valor).padEnd(20)} → ${resumo} (${ms}ms) | fontes: ${r.Fontes.join(', ')}`);
    return r;
  } catch (err) {
    console.log(`✗ ${tipo.padEnd(9)} ${String(valor).padEnd(20)} → ERRO: ${err.message}`);
  }
}

async function main() {
  const [, , tipoArg, valorArg] = process.argv;
  if (tipoArg && valorArg) {
    const r = await um(tipoArg, valorArg);
    if (r) console.log('\n' + JSON.stringify({ Result: [r], censored: true }, null, 2));
    return;
  }

  const casos = [
    ['cpf', '60235209872'],
    ['telefone', '42984138233'],
    ['email', 'valdambroski@hotmail.com'],
    ['placa', 'MNL9299'],
  ];
  for (const [tipo, valor] of casos) await um(tipo, valor);
}

main().catch((e) => { console.error('Falhou:', e.message); process.exit(1); });
