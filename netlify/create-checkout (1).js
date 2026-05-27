exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { items, customerEmail, successUrl, cancelUrl } = JSON.parse(event.body);
    const secretKey = process.env.STRIPE_SECRET_KEY;

    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY no configurada');
    }

    // Construir line_items para la API de Stripe
    const lineItems = items.map(item => ({
      price_data: {
        currency: 'eur',
        product_data: {
          name: item.name,
          ...(item.brand ? { description: item.brand } : {}),
          ...(item.img  ? { images: [item.img] }       : {}),
        },
        unit_amount: Math.round(item.price * 100),
      },
      quantity: item.qty,
    }));

    // Construir body para la API REST de Stripe (application/x-www-form-urlencoded)
    const encode = (obj, prefix = '') => {
      return Object.entries(obj).flatMap(([key, val]) => {
        const fullKey = prefix ? `${prefix}[${key}]` : key;
        if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
          return encode(val, fullKey);
        } else if (Array.isArray(val)) {
          return val.flatMap((item, i) => {
            if (typeof item === 'object') {
              return encode(item, `${fullKey}[${i}]`);
            }
            return [`${encodeURIComponent(`${fullKey}[${i}]`)}=${encodeURIComponent(item)}`];
          });
        } else {
          return [`${encodeURIComponent(fullKey)}=${encodeURIComponent(val)}`];
        }
      }).join('&');
    };

    const params = {
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: successUrl || `${event.headers.origin}?pago=ok`,
      cancel_url:  cancelUrl  || `${event.headers.origin}?pago=cancelado`,
      locale: 'es',
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      'shipping_address_collection[allowed_countries][0]': 'ES',
      'shipping_address_collection[allowed_countries][1]': 'PT',
      'shipping_address_collection[allowed_countries][2]': 'FR',
    };

    const body = encode({
      payment_method_types: ['card'],
      mode: 'payment',
      success_url: successUrl || `${event.headers.origin}?pago=ok`,
      cancel_url:  cancelUrl  || `${event.headers.origin}?pago=cancelado`,
      locale: 'es',
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      line_items: lineItems,
      shipping_address_collection: { allowed_countries: ['ES', 'PT', 'FR', 'DE', 'IT'] },
    });

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    const session = await response.json();

    if (session.error) {
      throw new Error(session.error.message);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url }),
    };

  } catch (err) {
    console.error('Error:', err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
