const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20'
});

const FLAT_SHIPPING_CENTS = 695;
const FREE_SHIPPING_THRESHOLD_CENTS = 10000;

const PRODUCT_PRICES = {
  'The Forever Tee': 2999,
  "Men's Tank": 2499,
  "Women's Full Tank": 2499,
  "Women's Half Tank": 2499,
  'The Everyday Light Hoodie': 3499,
  'The Forever Hoodie': 5999,
  "Women's Crop Hoodie": 5999,
  'The Zip Up': 5999,
  'Lodge Blanket': 4999,
  'Pajama Pants': 3999
};

const STYLE_NUMBERS = {
  'The Forever Tee': '6010',
  "Men's Tank": '3633',
  "Women's Full Tank": '8430',
  "Women's Half Tank": '6682',
  'The Everyday Light Hoodie': '3512',
  'The Forever Hoodie': '9302',
  "Women's Crop Hoodie": '9384',
  'The Zip Up': '3739',
  'Lodge Blanket': 'INDBKTSB',
  'Pajama Pants': 'BM6624'
};

function cleanText(value, max = 120) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
}

function getStyleNumber(productName) {
  return STYLE_NUMBERS[productName] || '';
}

function buildItemFields(item, index) {
  const product = cleanText(item.product, 80);
  const designFile = cleanText(item.designFile || (item.design ? `${item.design}.png` : ''), 80);
  return {
    [`item_${index}_product`]: product,
    [`item_${index}_style_number`]: getStyleNumber(product),
    [`item_${index}_town`]: cleanText(item.town, 60),
    [`item_${index}_design_name`]: cleanText(item.designName, 80),
    [`item_${index}_design_file`]: designFile,
    [`item_${index}_placement`]: cleanText(item.placement, 40),
    [`item_${index}_size`]: cleanText(item.size, 40),
    [`item_${index}_apparel_color`]: cleanText(item.apparelColor || item.productColor, 60),
    [`item_${index}_design_color`]: cleanText(item.designColorName || item.designColor, 60),
    [`item_${index}_quantity`]: String(Math.max(1, Math.min(20, Number(item.qty || 1))))
  };
}

function buildItemDetailLine(item, index) {
  const product = cleanText(item.product, 80);
  const qty = Math.max(1, Math.min(20, Number(item.qty || 1)));
  const style = getStyleNumber(product) || 'N/A';
  const designFile = cleanText(item.designFile || (item.design ? `${item.design}.png` : ''), 80) || 'N/A';

  return [
    `Product: ${product || 'N/A'}`,
    `Style Number: ${style}`,
    `Town: ${cleanText(item.town, 60) || 'N/A'}`,
    `Design Name: ${cleanText(item.designName, 80) || 'N/A'}`,
    `Design File: ${designFile}`,
    `Placement: ${cleanText(item.placement, 40) || 'N/A'}`,
    `Size: ${cleanText(item.size, 40) || 'N/A'}`,
    `Apparel Color: ${cleanText(item.apparelColor || item.productColor, 60) || 'N/A'}`,
    `Design Color: ${cleanText(item.designColorName || item.designColor, 60) || 'N/A'}`,
    `Quantity: ${qty}`
  ].join(' | ');
}


function formatMoney(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildOwnerOrderEmail({ cart, customer, notes, promoCode, subtotalCents, shippingCents, session }) {
  const customerName = [customer?.firstName, customer?.lastName].map((v) => cleanText(v, 40)).filter(Boolean).join(' ') || 'N/A';
  const rows = (cart || []).map((item, idx) => {
    const product = cleanText(item.product, 80) || 'N/A';
    const qty = Math.max(1, Math.min(20, Number(item.qty || 1)));
    const unit = PRODUCT_PRICES[product] || 0;
    return `<tr>
      <td>${idx + 1}</td>
      <td>${escapeHtml(product)}<br><small>Style #: ${escapeHtml(getStyleNumber(product) || 'N/A')}</small></td>
      <td>${escapeHtml(cleanText(item.size, 40) || 'N/A')}</td>
      <td>${escapeHtml(cleanText(item.apparelColor || item.productColor, 60) || 'N/A')}</td>
      <td>${escapeHtml(cleanText(item.town, 60) || 'N/A')}</td>
      <td>${escapeHtml(cleanText(item.designName, 80) || 'N/A')}<br><small>File: ${escapeHtml(cleanText(item.designFile || (item.design ? `${item.design}.png` : ''), 80) || 'N/A')}</small></td>
      <td>${escapeHtml(cleanText(item.placement, 40) || 'N/A')}</td>
      <td>${escapeHtml(cleanText(item.designColorName || item.designColor, 60) || 'N/A')}</td>
      <td>${qty}</td>
      <td>${formatMoney(unit * qty)}</td>
    </tr>`;
  }).join('');

  const totalCents = Number(subtotalCents || 0) + Number(shippingCents || 0);
  const text = [
    `New Slope Shirts order submitted`,
    `Checkout Session: ${session?.id || 'N/A'}`,
    `Customer: ${customerName}`,
    `Email: ${cleanText(customer?.email, 120) || 'N/A'}`,
    `Phone: ${cleanText(customer?.phone, 40) || 'N/A'}`,
    `Address: ${cleanText(customer?.address, 120) || ''} ${cleanText(customer?.apt, 80) || ''}, ${cleanText(customer?.city, 80) || ''}, ${cleanText(customer?.state, 30) || ''} ${cleanText(customer?.zip, 20) || ''}`,
    `Promo Code Entered: ${cleanText(promoCode, 80) || 'None'}`,
    `Subtotal: ${formatMoney(subtotalCents)}`,
    `Shipping: ${formatMoney(shippingCents)}`,
    `Total before Stripe tax/adjustments: ${formatMoney(totalCents)}`,
    `Notes: ${cleanText(notes, 500) || 'None'}`,
    buildOrderSummary(cart, notes)
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;color:#172b3a;line-height:1.4;">
      <h2>New Slope Shirts Order Submitted</h2>
      <p><strong>Checkout Session:</strong> ${escapeHtml(session?.id || 'N/A')}</p>
      <h3>Customer</h3>
      <p>
        <strong>Name:</strong> ${escapeHtml(customerName)}<br>
        <strong>Email:</strong> ${escapeHtml(cleanText(customer?.email, 120) || 'N/A')}<br>
        <strong>Phone:</strong> ${escapeHtml(cleanText(customer?.phone, 40) || 'N/A')}<br>
        <strong>Address:</strong> ${escapeHtml(cleanText(customer?.address, 120) || '')} ${escapeHtml(cleanText(customer?.apt, 80) || '')}, ${escapeHtml(cleanText(customer?.city, 80) || '')}, ${escapeHtml(cleanText(customer?.state, 30) || '')} ${escapeHtml(cleanText(customer?.zip, 20) || '')}
      </p>
      <h3>Order</h3>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
        <thead><tr><th>#</th><th>Product</th><th>Size</th><th>Apparel Color</th><th>Town</th><th>Design</th><th>Placement</th><th>Design Color</th><th>Qty</th><th>Line Total</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p>
        <strong>Subtotal:</strong> ${formatMoney(subtotalCents)}<br>
        <strong>Shipping:</strong> ${formatMoney(shippingCents)}<br>
        <strong>Total before Stripe tax/adjustments:</strong> ${formatMoney(totalCents)}<br>
        <strong>Promo Code Entered:</strong> ${escapeHtml(cleanText(promoCode, 80) || 'None')}
      </p>
      <p><strong>Special Requests:</strong> ${escapeHtml(cleanText(notes, 500) || 'None')}</p>
      <p><small>This email is sent when checkout is created. Confirm payment status in Stripe before production.</small></p>
    </div>`;

  return { text, html };
}

async function sendOwnerOrderEmail(orderEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ORDER_EMAIL_TO || process.env.SANDSHIRTS_ORDER_EMAIL_TO;
  const from = process.env.ORDER_EMAIL_FROM || 'Slope Shirts Orders <orders@sandshirts.com>';
  if (!apiKey || !to) return;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to,
      subject: 'New Slope Shirts Order Details',
      html: orderEmail.html,
      text: orderEmail.text
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Order email failed: ${response.status} ${body}`.slice(0, 300));
  }
}

function buildOrderSummary(cart, notes) {
  const itemSummary = (cart || [])
    .map((item, idx) => `Item ${idx + 1}: ${buildItemDetailLine(item, idx + 1)}`)
    .join('\n');
  const specialRequests = cleanText(notes, 500);
  const fullSummary = specialRequests
    ? `${itemSummary}\nSpecial Requests: ${specialRequests}`
    : itemSummary;
  return fullSummary.slice(0, 500);
}

function buildPaymentDescription(cart) {
  const count = (cart || []).reduce((sum, item) => sum + Math.max(1, Math.min(20, Number(item.qty || 1))), 0);
  return `Slope Shirts custom order — ${count} item${count === 1 ? '' : 's'} — see metadata for production details`;
}

function buildProductionMetadata(cart, notes) {
  const specialRequests = cleanText(notes, 500);
  const meta = {
    order_item_count: String((cart || []).length),
    order_special_requests: specialRequests || 'None'
  };

  (cart || []).slice(0, 20).forEach((item, idx) => {
    const n = idx + 1;
    const product = cleanText(item.product, 80) || 'N/A';
    const style = getStyleNumber(product) || 'N/A';
    const qty = Math.max(1, Math.min(20, Number(item.qty || 1)));
    const designFile = cleanText(item.designFile || (item.design ? `${item.design}.png` : ''), 80) || 'N/A';

    meta[`item_${n}`] = [
      `Product: ${product}`,
      `Style #: ${style}`,
      `Qty: ${qty}`,
      `Town: ${cleanText(item.town, 60) || 'N/A'}`,
      `Design: ${cleanText(item.designName, 80) || 'N/A'}`,
      `Design File: ${designFile}`,
      `Placement: ${cleanText(item.placement, 40) || 'N/A'}`,
      `Size: ${cleanText(item.size, 40) || 'N/A'}`,
      `Apparel Color: ${cleanText(item.apparelColor || item.productColor, 60) || 'N/A'}`,
      `Design Color: ${cleanText(item.designColorName || item.designColor, 60) || 'N/A'}`
    ].join(' | ').slice(0, 500);
  });

  if ((cart || []).length > 20) meta.additional_items = String((cart || []).length - 20);
  return meta;
}

async function findPromotionCode(code) {
  const trimmed = cleanText(code, 80);
  if (!trimmed) return null;
  const result = await stripe.promotionCodes.list({
    code: trimmed,
    active: true,
    limit: 1,
    expand: ['data.coupon']
  });
  return result.data && result.data.length ? result.data[0] : null;
}

async function getStripeProductMap() {
  const map = {};
  let starting_after;
  do {
    const page = await stripe.products.list({
      active: true,
      limit: 100,
      ...(starting_after ? { starting_after } : {})
    });
    for (const product of page.data) {
      if (product && product.name && !map[product.name]) {
        map[product.name] = product.id;
      }
    }
    starting_after = page.has_more && page.data.length ? page.data[page.data.length - 1].id : undefined;
  } while (starting_after);
  return map;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Stripe is not configured. Missing STRIPE_SECRET_KEY.' });
  }

  try {
    const { cart, customer, notes, promoCode } = req.body || {};

    if (!Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: 'Cart is empty.' });
    }

    const stripeProducts = await getStripeProductMap();

    let subtotalCents = 0;
    const line_items = cart.map((item) => {
      const productName = cleanText(item.product, 80);
      const unit_amount = PRODUCT_PRICES[productName];
      const quantity = Math.max(1, Math.min(20, Number(item.qty || 1)));

      if (!unit_amount) {
        throw new Error(`Unsupported product: ${productName || 'Unknown product'}`);
      }

      const STRIPE_NAME_ALIAS = { 'Lodge Blanket': 'Beach Blanket' };
      const stripeProductId = stripeProducts[productName] || stripeProducts[STRIPE_NAME_ALIAS[productName]];
      if (!stripeProductId) {
        throw new Error(`Stripe product is missing or inactive for: ${productName}`);
      }

      subtotalCents += unit_amount * quantity;

      return {
        quantity,
        price_data: {
          currency: 'usd',
          unit_amount,
          product: stripeProductId
        }
      };
    });

    const shippingCents = subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS ? 0 : FLAT_SHIPPING_CENTS;
    const shipping_options = [{
      shipping_rate_data: {
        type: 'fixed_amount',
        fixed_amount: {
          amount: shippingCents,
          currency: 'usd'
        },
        display_name: shippingCents === 0 ? 'Free Shipping' : 'Flat Rate Shipping'
      }
    }];

    const baseUrl = process.env.SITE_URL || `https://${req.headers.host}`;
    const cleanBaseUrl = baseUrl.replace(/\/$/, '');

    const customerName = [customer?.firstName, customer?.lastName].map((v) => cleanText(v, 40)).filter(Boolean).join(' ');
    const promotionCode = await findPromotionCode(promoCode);
    if (cleanText(promoCode, 80) && !promotionCode) {
      return res.status(400).json({ error: 'Invalid promo code.' });
    }

    const productionMetadata = buildProductionMetadata(cart, notes);
    const paymentDescription = buildPaymentDescription(cart);

    const sessionParams = {
      mode: 'payment',
      line_items,
      shipping_options,
      success_url: `${cleanBaseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${cleanBaseUrl}/order`,
      customer_email: cleanText(customer?.email, 120) || undefined,
      phone_number_collection: { enabled: true },
      shipping_address_collection: {
        allowed_countries: ['US']
      },
      billing_address_collection: 'auto',
      ...(promotionCode ? { discounts: [{ promotion_code: promotionCode.id }] } : { allow_promotion_codes: true }),
      payment_intent_data: {
        description: paymentDescription || 'Slope Shirts custom order',
        metadata: {
          order_summary: buildOrderSummary(cart, notes),
          ...productionMetadata
        }
      },
      metadata: {
        customer_name: customerName,
        phone: cleanText(customer?.phone, 40),
        address: cleanText(customer?.address, 120),
        apt: cleanText(customer?.apt, 80),
        city: cleanText(customer?.city, 80),
        state: cleanText(customer?.state, 30),
        zip: cleanText(customer?.zip, 20),
        notes: cleanText(notes, 450),
        promo_code_entered: cleanText(promoCode, 80),
        shipping_rule: shippingCents === 0 ? 'Free shipping over $100' : 'Flat $6.95 shipping',
        order_summary: buildOrderSummary(cart, notes),
        ...productionMetadata
      }
    };

    const session = await stripe.checkout.sessions.create(sessionParams);

    try {
      const orderEmail = buildOwnerOrderEmail({ cart, customer, notes, promoCode, subtotalCents, shippingCents, session });
      await sendOwnerOrderEmail(orderEmail);
    } catch (emailError) {
      console.error(emailError);
      // Do not block customer checkout if the owner notification email fails.
    }

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'Unable to create Stripe checkout.' });
  }
};
