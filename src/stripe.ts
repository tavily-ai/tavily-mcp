import Stripe from 'stripe';

// Load Stripe secret key from environment variables
// IMPORTANT: Never hardcode API keys in source code!
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
  console.warn('STRIPE_SECRET_KEY environment variable is not set. Stripe features will be disabled.');
}

// Initialize Stripe client only if API key is available
let stripe: Stripe | null = null;

if (STRIPE_SECRET_KEY) {
  stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16',
  });
}

// Interface for creating a payment intent
interface CreatePaymentIntentParams {
  amount: number;  // Amount in cents (smallest currency unit)
  currency?: string;
  customer?: string;
  description?: string;
  metadata?: Record<string, string>;
}

// Interface for creating a customer
interface CreateCustomerParams {
  email: string;
  name?: string;
  metadata?: Record<string, string>;
}

// Interface for creating a checkout session
interface CreateCheckoutSessionParams {
  lineItems?: Array<{
    price_data?: {
      currency: string;
      product_data: {
        name: string;
        description?: string;
      };
      unit_amount: number;  // Amount in cents
    };
    quantity: number;
  }>;
  mode?: 'payment' | 'subscription' | 'setup';
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  metadata?: Record<string, string>;
}

/**
 * Check if Stripe is properly configured
 */
export function isStripeConfigured(): boolean {
  return stripe !== null;
}

/**
 * Create a payment intent
 */
export async function createPaymentIntent(params: CreatePaymentIntentParams): Promise<Stripe.PaymentIntent> {
  if (!stripe) {
    throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.');
  }

  return await stripe.paymentIntents.create({
    amount: params.amount,
    currency: params.currency || 'usd',
    customer: params.customer,
    description: params.description,
    metadata: params.metadata,
  });
}

/**
 * Retrieve a payment intent by ID
 */
export async function getPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
  if (!stripe) {
    throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.');
  }

  return await stripe.paymentIntents.retrieve(paymentIntentId);
}

/**
 * Create a new customer
 */
export async function createCustomer(params: CreateCustomerParams): Promise<Stripe.Customer> {
  if (!stripe) {
    throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.');
  }

  return await stripe.customers.create({
    email: params.email,
    name: params.name,
    metadata: params.metadata,
  });
}

/**
 * Retrieve a customer by ID
 */
export async function getCustomer(customerId: string): Promise<Stripe.Customer> {
  if (!stripe) {
    throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.');
  }

  return await stripe.customers.retrieve(customerId) as Stripe.Customer;
}

/**
 * List charges with optional filters
 */
export async function listCharges(limit?: number, customer?: string): Promise<Stripe.Charge[]> {
  if (!stripe) {
    throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.');
  }

  const charges = await stripe.charges.list({
    limit: limit || 10,
    customer,
  });

  return charges.data;
}

/**
 * Create a checkout session
 */
export async function createCheckoutSession(params: CreateCheckoutSessionParams): Promise<Stripe.Checkout.Session> {
  if (!stripe) {
    throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.');
  }

  return await stripe.checkout.sessions.create({
    line_items: params.lineItems,
    mode: params.mode || 'payment',
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    customer_email: params.customerEmail,
    metadata: params.metadata,
  });
}

/**
 * Retrieve a checkout session
 */
export async function getCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
  if (!stripe) {
    throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.');
  }

  return await stripe.checkout.sessions.retrieve(sessionId);
}

export default stripe;
