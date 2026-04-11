// api/create-order.js
// Vercel Serverless Function — créer une commande PayPal

export default async function handler(req, res) {
  // CORS headers (si besoin)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Récupère les credentials depuis les variables d'environnement Vercel
  const PAYPAL_CLIENT_ID     = process.env.PAYPAL_CLIENT_ID;
  const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
  const PAYPAL_BASE_URL      = 'https://api-m.paypal.com'; // Live
  // Pour les tests sandbox : 'https://api-m.sandbox.paypal.com'

  try {
    const { amount, currency, customer } = req.body;

    // 1. Obtenir un token d'accès PayPal
    const authRes = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64'),
      },
      body: 'grant_type=client_credentials',
    });

    const authData = await authRes.json();
    if (!authData.access_token) {
      return res.status(500).json({ error: 'PayPal auth failed', details: authData });
    }

    // 2. Créer la commande PayPal
    const orderRes = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${authData.access_token}`,
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: {
            currency_code: currency || 'EUR',
            value:         amount   || '7.90',
          },
          description: 'Lampe Torche Luminova — 100 000 Lumens',
          custom_id:   customer?.email || '',
        }],
        application_context: {
          brand_name:          'LUMINOVA',
          locale:              'fr-FR',
          shipping_preference: 'NO_SHIPPING', // on gère la livraison nous-mêmes
          user_action:         'PAY_NOW',
        },
      }),
    });

    const orderData = await orderRes.json();

    if (!orderData.id) {
      return res.status(500).json({ error: 'Order creation failed', details: orderData });
    }

    return res.status(200).json({ id: orderData.id });

  } catch (err) {
    console.error('create-order error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
