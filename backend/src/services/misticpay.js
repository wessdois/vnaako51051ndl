const axios = require('axios');

const API_URL = process.env.MISTICPAY_API_URL || 'https://api.misticpay.com/api';

// Fonte da verdade do preço. O frontend manda só o SKU — nunca o valor.
const PLANOS = {
  '1BUSCA':   { creditos: 1,  valor: 9.90,  descricao: 'Capivara Online - 1 consulta' },
  '3BUSCAS':  { creditos: 3,  valor: 19.90, descricao: 'Capivara Online - 3 consultas' },
  '5BUSCAS':  { creditos: 5,  valor: 29.90, descricao: 'Capivara Online - 5 consultas' },
  '10BUSCAS': { creditos: 10, valor: 49.90, descricao: 'Capivara Online - 10 consultas' },
};

function headers() {
  return {
    ci: process.env.MISTICPAY_CLIENT_ID,
    cs: process.env.MISTICPAY_CLIENT_SECRET,
    'Content-Type': 'application/json',
  };
}

// Cria a cobrança PIX. `transactionId` é o id da nossa compra: é ele que volta
// no webhook e é o que amarra o pagamento ao usuário.
async function criarPix({ transactionId, valor, descricao, payerName, payerDocument, webhookUrl }) {
  const { data } = await axios.post(
    `${API_URL}/transactions/create`,
    {
      amount: valor,
      payerName,
      payerDocument,
      transactionId,
      description: descricao,
      projectWebhook: webhookUrl,
    },
    { headers: headers(), timeout: 20000 },
  );

  const d = (data && data.data) || {};
  if (!d.copyPaste) throw new Error('MisticPay não retornou o código PIX');

  return {
    estado: d.transactionState,
    valor: d.transactionAmount,
    qrBase64: d.qrCodeBase64,
    copyPaste: d.copyPaste,
  };
}

module.exports = { criarPix, PLANOS };
