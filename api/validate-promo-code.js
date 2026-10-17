const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20'
});

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

function cleanText(value, max = 120) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
}

function moneyFromCents(cents) {
  return '$' + (Number(cents || 0) / 100).toFixed(2);
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

function getEligibleSubtotalCents(cart, coupon, stripeProducts) {
  const restrictedProductIds = coupon?.applies_to?.products || [];
  const hasProductRestrictions = Array.isArray(restrictedProductIds) && restrictedProductIds.length > 0;

  let eligibleSubtotal = 0;
  for (const item of Array.isArray(cart) ? cart : []) {
    const productName = cleanText(item.product, 80);
    const unitAmount = PRODUCT_PRICES[productName];
    const quantity = Math.max(1, Math.min(20, Number(item.qty || 1)));
    if (!unitAmount) continue;

    const stripeProductId = stripeProducts[productName];
    if (hasProductRestrictions && !restrictedProductIds.includes(stripeProductId)) continue;

    eligibleSubtotal += unitAmount * quantity;
  }
  return eligibleSubtotal;
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
    const { promoCode, subtotalCents = 0, cart = [] } = req.body || {};
    const code = cleanText(promoCode, 80);
    if (!code) return res.status(400).json({ valid: false, error: 'Enter a promo code.' });

    const result = await stripe.promotionCodes.list({
      code,
      active: true,
      limit: 1,
      expand: ['data.coupon']
    });

    const promo = result.data && result.data.length ? result.data[0] : null;
    if (!promo || !promo.coupon || promo.coupon.valid === false) {
      return res.status(404).json({ valid: false, error: 'Invalid promo code.' });
    }

    const coupon = promo.coupon;
    const stripeProducts = await getStripeProductMap();
    let baseCents = getEligibleSubtotalCents(cart, coupon, stripeProducts);

    // Older pages may call this endpoint without cart; keep a safe fallback.
    if (!Array.isArray(cart) || cart.length === 0) {
      baseCents = Math.max(0, Number(subtotalCents || 0));
    }

    if (baseCents <= 0) {
      return res.status(400).json({
        valid: false,
        error: 'This promo code does not apply to the items currently in your cart.'
      });
    }

    let discountCents = 0;
    let message = 'Promo applied.';

    if (coupon.percent_off) {
      discountCents = Math.round(baseCents * (Number(coupon.percent_off) / 100));
      message = `Promo applied: ${coupon.percent_off}% off.`;
    } else if (coupon.amount_off) {
      discountCents = Math.min(baseCents, Number(coupon.amount_off));
      message = `Promo applied: ${moneyFromCents(discountCents)} off.`;
    }

    return res.status(200).json({
      valid: true,
      message,
      promo: {
        id: promo.id,
        code: promo.code,
        couponId: coupon.id,
        name: coupon.name || promo.code,
        percent_off: coupon.percent_off || null,
        amount_off: coupon.amount_off || null,
        currency: coupon.currency || 'usd',
        estimated_discount_cents: discountCents,
        eligible_subtotal_cents: baseCents
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ valid: false, error: error.message || 'Unable to validate promo code.' });
  }
};
