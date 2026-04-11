export default async function handler(req, res) {
  const CLIENT_ID     = process.env.PAYPAL_CLIENT_ID;
  const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
  const SANDBOX       = process.env.PAYPAL_SANDBOX;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).json({
      status: '❌ Variables manquantes',
      PAYPAL_CLIENT_ID:     CLIENT_ID     ? CLIENT_ID.slice(0,10)+'...'     : 'MANQUANT',
      PAYPAL_CLIENT_SECRET: CLIENT_SECRET ? CLIENT_SECRET.slice(0,6)+'...'  : 'MANQUANT',
      PAYPAL_SANDBOX:       SANDBOX       || 'non défini',
    });
  }

  const BASE = SANDBOX === 'true'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';

  try {
    const r = await fetch(`${BASE}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
      },
      body: 'grant_type=client_credentials',
    });
    const d = await r.json();

    return res.status(200).json({
      status:               d.access_token ? '✅ Auth PayPal OK' : '❌ Auth échouée',
      env:                  BASE.includes('sandbox') ? 'SANDBOX' : 'LIVE',
      PAYPAL_CLIENT_ID:     CLIENT_ID.slice(0,10)+'...',
      PAYPAL_CLIENT_SECRET: CLIENT_SECRET.slice(0,6)+'...',
      PAYPAL_SANDBOX:       SANDBOX || 'non défini',
      paypal_error:         d.error             || null,
      paypal_message:       d.error_description || null,
      token_ok:             !!d.access_token,
    });
  } catch(e) {
    return res.status(500).json({ status: '❌ Erreur réseau', error: e.message });
  }
}
