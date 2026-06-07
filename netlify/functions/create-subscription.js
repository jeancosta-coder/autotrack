const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
  }

  let email, paymentMethodId, priceId;
  try {
    ({ email, paymentMethodId, priceId } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ message: 'Corps de requête invalide.' }) };
  }

  if (!email || !paymentMethodId || !priceId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'email, paymentMethodId et priceId sont requis.' })
    };
  }

  try {
    // 1. Créer ou récupérer le customer Stripe
    const existing = await stripe.customers.list({ email, limit: 1 });
    let customer;
    if (existing.data.length > 0) {
      customer = existing.data[0];
    } else {
      customer = await stripe.customers.create({ email });
    }

    // 2. Attacher le paymentMethod au customer
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customer.id });

    // 3. Définir ce paymentMethod comme défaut de facturation
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: paymentMethodId }
    });

    // 4. Créer la subscription avec 14 jours d'essai
    await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
      trial_period_days: 14,
      default_payment_method: paymentMethodId,
      payment_settings: { payment_method_types: ['card'], save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent']
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };
  } catch (err) {
    console.error('Stripe error:', err.message);
    return {
      statusCode: 400,
      body: JSON.stringify({ message: err.message || 'Erreur lors de la création de la subscription.' })
    };
  }
};
