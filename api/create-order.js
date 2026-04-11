// api/create-order.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const PAYPAL_CLIENT_ID     = process.env.PAYPAL_CLIENT_ID;
  const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;

  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    console.error('Missing PayPal env vars');
    return res.status(500).json({ error: 'Variables d\'environnement manquantes sur Vercel.' });
  }

  const PAYPAL_BASE_URL = process.env.PAYPAL_SANDBOX === 'true'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';

  try {
    const { amount, currency, customer } = req.body;

    // 1. Token OAuth2
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
      console.error('PayPal auth failed:', authData);
      return res.status(500).json({ error: 'Auth PayPal échouée', details: authData.error_description });
    }

    // 2. Créer la commande
    const orderRes = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${authData.access_token}`,
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: { currency_code: currency || 'EUR', value: amount || '7.90' },
          description: 'Lampe Torche Luminova — 100 000 Lumens',
          custom_id:   customer?.email || 'client',
        }],
        application_context: {
          brand_name: 'LUMINOVA',
          locale: 'fr-FR',
          shipping_preference: 'NO_SHIPPING',
          user_action: 'PAY_NOW',
        },
      }),
    });
    const orderData = await orderRes.json();
    if (!orderData.id) {
      console.error('Order creation failed:', orderData);
      return res.status(500).json({ error: 'Création commande échouée', details: orderData.details?.[0]?.description });
    }

    return res.status(200).json({ id: orderData.id });
  } catch (err) {
    console.error('create-order exception:', err);
    return res.status(500).json({ error: err.message });
  }
}
