export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const PAYPAL_CLIENT_ID     = process.env.PAYPAL_CLIENT_ID;
  const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
  const RESEND_API_KEY       = process.env.RESEND_API_KEY;

  // ✅ TON EMAIL DIRECT (fallback si Vercel pas configuré)
  const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || "enzoguedeau00@gmail.com";

  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    return res.status(500).json({ error: 'Variables PayPal manquantes.' });
  }

  const PAYPAL_BASE_URL = process.env.PAYPAL_SANDBOX === 'true'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';

  try {
    const { amount, currency } = req.body;
    const customer = req.body.customer || {};

    // ✅ sécurisation des données client
    const customerData = {
      firstName: customer.firstName || '',
      lastName: customer.lastName || '',
      email: customer.email || '',
      phone: customer.phone || '',
      address: customer.address || '',
      zip: customer.zip || '',
      city: customer.city || '',
      country: customer.country || '',
    };

    console.log("📦 ORDER CUSTOMER:", customerData);

    // ── 1. TOKEN PAYPAL ─────────────────────────────
    const authRes = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(
          `${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`
        ).toString('base64'),
      },
      body: 'grant_type=client_credentials',
    });

    const authData = await authRes.json();

    if (!authData.access_token) {
      return res.status(500).json({
        error: 'Auth PayPal échouée',
        details: authData.error_description
      });
    }

    // ── 2. CREATE ORDER ─────────────────────────────
    const orderRes = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authData.access_token}`,
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: {
            currency_code: currency || 'EUR',
            value: amount || '0.01'
          },
          description: 'Lampe Torche Luminova — 100 000 Lumens',
          custom_id: customerData.email || 'client',
        }],
        application_context: {
          brand_name: 'LUMINOVA',
          locale: 'fr-FR',
          shipping_preference: 'GET_FROM_FILE', // ✅ FIX IMPORTANT
          user_action: 'PAY_NOW',
        },
      }),
    });

    const orderData = await orderRes.json();

    if (!orderData.id) {
      return res.status(500).json({
        error: 'Création commande échouée',
        details: orderData.details?.[0]?.description
      });
    }

    // ── 3. EMAIL RESEND ─────────────────────────────
    if (
      RESEND_API_KEY &&
      NOTIFY_EMAIL &&
      customerData.email &&
      customerData.firstName &&
      customerData.lastName
    ) {
      const orderNum = 'LUM-' + Date.now();

      const emailHtml = `
        <div style="font-family:Arial;max-width:600px;margin:auto;padding:24px;border:1px solid #eee">
          <h2>🛍️ Nouvelle commande Luminova</h2>
          <p>Réf: <b>${orderNum}</b><br>PayPal ID: ${orderData.id}</p>

          <hr>

          <h3>👤 Client</h3>
          <p>
            ${customerData.firstName} ${customerData.lastName}<br>
            ${customerData.email}<br>
            ${customerData.phone || '—'}
          </p>

          <h3>📦 Adresse</h3>
          <p>
            ${customerData.address}<br>
            ${customerData.zip} ${customerData.city}<br>
            ${customerData.country}
          </p>

          <hr>

          <h3>🛒 Commande</h3>
          <p>Lampe Torche Luminova</p>
          <p><b>${amount} ${currency}</b></p>

          <p style="color:#999;font-size:12px">Commande automatique Luminova</p>
        </div>
      `;

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: 'Luminova <commandes@luminova-sell.vercel.app>',
          to: [NOTIFY_EMAIL],
          subject: `🛍️ Nouvelle commande - ${customerData.firstName} ${customerData.lastName}`,
          html: emailHtml,
        }),
      }).catch(err => console.error("Email error:", err));
    }

    // ── RESPONSE ────────────────────────────────────
    return res.status(200).json({ id: orderData.id });

  } catch (err) {
    console.error('create-order exception:', err);
    return res.status(500).json({ error: err.message });
  }
}
