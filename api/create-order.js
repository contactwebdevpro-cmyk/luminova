// api/create-order.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const PAYPAL_CLIENT_ID     = process.env.PAYPAL_CLIENT_ID;
  const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
  const RESEND_API_KEY       = process.env.RESEND_API_KEY;
  const NOTIFY_EMAIL         = process.env.NOTIFY_EMAIL;

  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    return res.status(500).json({ error: 'Variables PayPal manquantes.' });
  }

  const PAYPAL_BASE_URL = process.env.PAYPAL_SANDBOX === 'true'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';

  try {
    const { amount, currency, customer } = req.body;

    // ── 1. Token PayPal ──────────────────────────────────────────────────
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
      return res.status(500).json({ error: 'Auth PayPal échouée', details: authData.error_description });
    }

    // ── 2. Créer la commande PayPal ──────────────────────────────────────
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
          custom_id: customer?.email || 'client',
        }],
        application_context: {
          brand_name: 'LUMINOVA',
          locale: 'fr-FR',
        shipping_preference: 'GET_FROM_FILE',
          user_action: 'PAY_NOW',
        },
      }),
    });
    const orderData = await orderRes.json();
    if (!orderData.id) {
      return res.status(500).json({ error: 'Création commande échouée', details: orderData.details?.[0]?.description });
    }

    // ── 3. Envoyer email de notification (si Resend configuré) ───────────
    if (RESEND_API_KEY && NOTIFY_EMAIL && customer) {
      const orderNum = 'LUM-' + Date.now();
      const emailHtml = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;padding:32px;border-radius:8px;border:1px solid #eee">
          <h2 style="color:#111;margin-bottom:4px">🛍️ Nouvelle commande Luminova</h2>
          <p style="color:#666;margin-top:0">Réf. <strong>${orderNum}</strong> — PayPal Order ID: ${orderData.id}</p>
          
          <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
          
          <h3 style="color:#111;margin-bottom:12px">👤 Client</h3>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr><td style="padding:6px 0;color:#666;width:140px">Nom</td><td style="padding:6px 0"><strong>${customer.firstName} ${customer.lastName}</strong></td></tr>
            <tr><td style="padding:6px 0;color:#666">Email</td><td style="padding:6px 0">${customer.email}</td></tr>
            <tr><td style="padding:6px 0;color:#666">Téléphone</td><td style="padding:6px 0">${customer.phone || '—'}</td></tr>
          </table>

          <hr style="border:none;border-top:1px solid #eee;margin:20px 0">

          <h3 style="color:#111;margin-bottom:12px">📦 Adresse de livraison</h3>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr><td style="padding:6px 0;color:#666;width:140px">Adresse</td><td style="padding:6px 0">${customer.address}</td></tr>
            <tr><td style="padding:6px 0;color:#666">Code postal</td><td style="padding:6px 0">${customer.zip}</td></tr>
            <tr><td style="padding:6px 0;color:#666">Ville</td><td style="padding:6px 0">${customer.city}</td></tr>
            <tr><td style="padding:6px 0;color:#666">Pays</td><td style="padding:6px 0">${customer.country}</td></tr>
          </table>

          <hr style="border:none;border-top:1px solid #eee;margin:20px 0">

          <h3 style="color:#111;margin-bottom:12px">🛒 Commande</h3>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr><td style="padding:6px 0;color:#666;width:140px">Produit</td><td style="padding:6px 0">Lampe Torche Luminova</td></tr>
            <tr><td style="padding:6px 0;color:#666">Quantité</td><td style="padding:6px 0">1</td></tr>
            <tr><td style="padding:6px 0;color:#666">Montant</td><td style="padding:6px 0"><strong style="color:#e8232a">${amount} ${currency}</strong></td></tr>
            <tr><td style="padding:6px 0;color:#666">Statut paiement</td><td style="padding:6px 0"><span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:4px;font-size:12px">En attente de capture</span></td></tr>
          </table>

          <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
          <p style="color:#999;font-size:12px;text-align:center">Luminova — Commande reçue automatiquement</p>
        </div>
      `;

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from:    'Luminova <commandes@luminova-sell.vercel.app>',
          to:      [NOTIFY_EMAIL],
          subject: `🛍️ Nouvelle commande — ${customer.firstName} ${customer.lastName} — 7.90 EUR`,
          html:    emailHtml,
        }),
      }).catch(e => console.error('Email error:', e));
    }

    return res.status(200).json({ id: orderData.id });

  } catch (err) {
    console.error('create-order exception:', err);
    return res.status(500).json({ error: err.message });
  }
}
