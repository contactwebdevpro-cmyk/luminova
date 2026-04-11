// api/capture-order.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const PAYPAL_CLIENT_ID     = process.env.PAYPAL_CLIENT_ID;
  const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;

  // Même logique que create-order : sandbox ou live selon la variable d'env
  const PAYPAL_BASE_URL = process.env.PAYPAL_SANDBOX === 'true'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';

  try {
    const { orderID } = req.body;
    if (!orderID) return res.status(400).json({ error: 'Missing orderID' });

    // 1. Token
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
      return res.status(500).json({ error: 'Auth PayPal échouée' });
    }

    // 2. Capture
    const captureRes = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${authData.access_token}`,
      },
    });
    const captureData = await captureRes.json();

    return res.status(200).json({
      status:  captureData.status,
      details: captureData,
    });

  } catch (err) {
    console.error('capture-order error:', err);
    return res.status(500).json({ error: err.message });
  }
}
