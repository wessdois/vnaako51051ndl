const axios = require('axios');

const API_URL = process.env.MISTICPAY_API_URL;
const API_KEY = process.env.MISTICPAY_API_KEY;

// Mapa de preços por SKU
const PRECOS = {
  '1BUSCA':    { valor: 9.90,  descricao: '1 Relatório Completo' },
  '3BUSCAS':   { valor: 19.90, descricao: '3 Relatórios Completos' },
  '5BUSCAS':   { valor: 29.90, descricao: '5 Relatórios Completos' },
  '10BUSCAS':  { valor: 49.90, descricao: '10 Relatórios Completos' },
  '1BUSCANOME':{ valor: 9.90,  descricao: '1 Relatório por Nome' },
};

async function criarCheckout({ sku, leadId, hash }) {
  const plano = PRECOS[sku];
  if (!plano) throw new Error(`SKU inválido: ${sku}`);

  const callbackUrl = `${process.env.BASE_URL}/api/checkout/callback`;
  const successUrl  = `${process.env.BASE_URL}/checkout/sucesso/${hash}`;

  // Ajuste os campos conforme a documentação real da MisticPay
  const { data } = await axios.post(
    `${API_URL}/v1/payment`,
    {
      amount: plano.valor,
      description: plano.descricao,
      external_id: String(leadId),
      callback_url: callbackUrl,
      success_url: successUrl,
    },
    {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  // Espera que a API retorne { checkout_url: '...' }
  return data.checkout_url;
}

module.exports = { criarCheckout, PRECOS };
