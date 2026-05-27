exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { items, customerEmail, customerName, orderData, successUrl, cancelUrl } = JSON.parse(event.body);
    const secretKey = process.env.STRIPE_SECRET_KEY;

    if (!secretKey) throw new Error('STRIPE_SECRET_KEY no configurada');

    // Encode order data for success URL
    const orderParam = encodeURIComponent(JSON.stringify(orderData));

    const encode = (obj, prefix = '') => {
      return Object.entries(obj).flatMap(([key, val]) => {
        const fullKey = prefix ? `${prefix}[${key}]` : key;
        if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
          return encode(val, fullKey);
        } else if (Array.isArray(val)) {
          return val.flatMap((item, i) => {
            if (typeof item === 'object') return encode(item, `${fullKey}[${i}]`);
            return [`${encodeURIComponent(`${fullKey}[${i}]`)}=${encodeURIComponent(item)}`];
          });
        } else {
          return [`${encodeURIComponent(fullKey)}=${encodeURIComponent(val)}`];
        }
      }).join('&');
    };

    const body = encode({
      payment_method_types: ['card'],
      mode: 'payment',
      success_url: (successUrl || `${event.headers.origin}?pago=ok`) + `&order=${orderParam}`,
      cancel_url:  cancelUrl || `${event.headers.origin}?pago=cancelado`,
      locale: 'es',
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      line_items: items.map(item => ({
        price_data: {
          currency: 'eur',
          product_data: {
            name: item.name,
            ...(item.brand ? { description: item.brand } : {}),
            ...(item.img ? { images: [item.img] } : {}),
          },
          unit_amount: Math.round(item.price * 100),
        },
        quantity: item.qty,
      })),
      shipping_address_collection: { allowed_countries: ['ES', 'PT', 'FR', 'DE', 'IT'] },
    });

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    const session = await stripeRes.json();
    if (session.error) throw new Error(session.error.message);

    // Send confirmation email via EmailJS REST API (from server, no domain restriction)
    if (orderData && customerEmail) {
      try {
        await fetch('https://api.emailjs.com/api/v1.0/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            service_id:  'service_y5j5u45',
            template_id: 'juhkfbc',
            user_id:     'ml5tgZCgk_9E19RYJ',
            accessToken: 'ftS-JhXB8rYT2KFD0lu-0',
            template_params: {
              to_name:         orderData.name,
              name:            orderData.name,
              to_email:        customerEmail,
              email:           customerEmail,
              order_id:        orderData.orderId,
              order_items:     orderData.itemsList,
              order_total:     orderData.total,
              delivery_days:   orderData.days,
              tracking_url:    '',
              tracking_number: '',
              message:         orderData.itemsList,
            }
          })
        });
        console.log('[EmailJS] Email sent OK');
      } catch(emailErr) {
        console.error('[EmailJS] Error:', emailErr);
      }
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
