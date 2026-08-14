const router = require('express').Router();
const extractUser = require('../middleware/authSupabase');
const { criarPix, PLANOS } = require('../services/misticpay');
const db = require('../services/supabase');

const soDigitos = (v) => String(v || '').replace(/\D/g, '');

function cpfValido(cpf) {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const [len, pos] of [[9, 10], [10, 11]]) {
    let soma = 0;
    for (let i = 0; i < len; i++) soma += parseInt(cpf[i], 10) * (pos - i);
    let dig = (soma * 10) % 11;
    if (dig === 10) dig = 0;
    if (dig !== parseInt(cpf[len], 10)) return false;
  }
  return true;
}

// GET /api/pagamento/planos
router.get('/planos', (_req, res) => {
  res.json({
    planos: Object.entries(PLANOS).map(([sku, p]) => ({
      sku, creditos: p.creditos, valor: p.valor,
    })),
  });
});

// GET /api/pagamento/pagador  →  dados salvos da última compra confirmada
router.get('/pagador', extractUser, async (req, res) => {
  if (!req.user) return res.status(401).json({ status: 'error' });

  const pagador = await db.getUltimoPagador(req.user.id);
  if (!pagador) return res.json({ status: 'ok', pagador: null });

  return res.json({
    status: 'ok',
    pagador: {
      nome: pagador.payer_name,
      cpf: pagador.payer_document,
      // Só o final vai para a tela; o resto o usuário já sabe que é dele.
      cpfMascarado: '•••.•••.' + String(pagador.payer_document).slice(6, 9) + '-' + String(pagador.payer_document).slice(9),
    },
  });
});

// POST /api/pagamento/pix  →  cria a cobrança e devolve QR + copia-e-cola
router.post('/pix', extractUser, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ status: 'error', message: 'Entre na sua conta para comprar créditos.' });
  }

  const plano = PLANOS[req.body.sku];
  if (!plano) {
    return res.status(400).json({ status: 'error', message: 'Plano inválido.' });
  }

  const nome = String(req.body.nome || '').trim().replace(/\s+/g, ' ');
  const cpf = soDigitos(req.body.cpf);

  if (nome.length < 5 || !nome.includes(' ')) {
    return res.status(400).json({ status: 'error', message: 'Informe seu nome completo.' });
  }
  if (!cpfValido(cpf)) {
    return res.status(400).json({ status: 'error', message: 'CPF inválido.' });
  }

  let compra;
  try {
    compra = await db.createPurchase({
      userId: req.user.id,
      sku: req.body.sku,
      credits: plano.creditos,
      amount: plano.valor,
      payerName: nome,
      payerDocument: cpf,
    });
  } catch (err) {
    console.error('[pagamento] createPurchase:', err.response?.data || err.message);
    return res.status(500).json({ status: 'error', message: 'Não foi possível iniciar a compra.' });
  }

  try {
    const pix = await criarPix({
      transactionId: compra.id,
      valor: plano.valor,
      descricao: plano.descricao,
      payerName: nome,
      payerDocument: cpf,
      webhookUrl: `${process.env.API_PUBLIC_URL}/api/pagamento/webhook/${process.env.MISTICPAY_WEBHOOK_SECRET}`,
    });

    db.updatePurchase(compra.id, { provider_state: pix.estado, copy_paste: pix.copyPaste }).catch(() => {});

    return res.json({
      status: 'ok',
      purchaseId: compra.id,
      creditos: plano.creditos,
      valor: plano.valor,
      qrBase64: pix.qrBase64,
      copyPaste: pix.copyPaste,
    });
  } catch (err) {
    console.error('[pagamento] criarPix:', err.response?.data || err.message);
    db.updatePurchase(compra.id, { status: 'failed' }).catch(() => {});
    return res.status(502).json({ status: 'error', message: 'O provedor de pagamento não respondeu. Tente novamente.' });
  }
});

// GET /api/pagamento/status/:id  →  o frontend consulta enquanto espera o PIX cair
router.get('/status/:id', extractUser, async (req, res) => {
  if (!req.user) return res.status(401).json({ status: 'error' });

  const compra = await db.getPurchase(req.params.id);
  if (!compra || compra.user_id !== req.user.id) {
    return res.status(404).json({ status: 'error', message: 'Compra não encontrada.' });
  }

  const saldo = compra.status === 'paid' ? await db.getCredits(req.user.id) : null;
  return res.json({ status: compra.status, creditos: compra.credits, saldo });
});

// POST /api/pagamento/webhook/:secret  →  MisticPay confirmando o pagamento.
// A MisticPay não expõe endpoint de consulta, então o webhook é a única fonte de
// confirmação. Defesas: segredo na URL, valor conferido contra o nosso registro,
// e o crédito em si é idempotente no banco (credit_purchase).
router.post('/webhook/:secret', async (req, res) => {
  if (req.params.secret !== process.env.MISTICPAY_WEBHOOK_SECRET) {
    return res.sendStatus(404);
  }

  const corpo = req.body || {};
  const dados = corpo.data || corpo;
  const purchaseId = dados.transactionId || dados.transaction_id || dados.externalId;
  const estado = String(dados.transactionState || dados.status || '').toUpperCase();
  const valor = Number(dados.transactionAmount ?? dados.amount);

  console.log('[webhook] compra=%s estado=%s valor=%s', purchaseId, estado, valor);

  // Sempre 200: erro nosso não deve fazer a MisticPay reenviar em loop.
  if (!purchaseId) return res.sendStatus(200);

  const PAGO = ['PAGO', 'APROVADO', 'CONCLUIDO', 'CONCLUÍDO', 'COMPLETED', 'PAID', 'APPROVED'];
  if (!PAGO.includes(estado)) {
    if (['CANCELADO', 'EXPIRADO', 'FAILED', 'CANCELLED'].includes(estado)) {
      db.updatePurchase(purchaseId, { status: 'expired', provider_state: estado }).catch(() => {});
    }
    return res.sendStatus(200);
  }

  try {
    const compra = await db.getPurchase(purchaseId);
    if (!compra) {
      console.warn('[webhook] compra desconhecida: %s', purchaseId);
      return res.sendStatus(200);
    }

    // Confere o valor: um webhook forjado com valor menor não credita.
    if (Number.isFinite(valor) && Math.abs(valor - Number(compra.amount)) > 0.01) {
      console.warn('[webhook] valor divergente em %s: recebido %s, esperado %s', purchaseId, valor, compra.amount);
      return res.sendStatus(200);
    }

    const saldo = await db.creditPurchase(purchaseId);
    if (saldo === -2) console.log('[webhook] %s já creditada, ignorando', purchaseId);
    else console.log('[webhook] %s creditada, saldo do usuário: %s', purchaseId, saldo);
  } catch (err) {
    console.error('[webhook] erro ao creditar %s:', purchaseId, err.response?.data || err.message);
  }

  return res.sendStatus(200);
});

module.exports = router;
