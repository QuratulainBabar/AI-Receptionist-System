import Stripe from "stripe";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";

let client: Stripe | null = null;

export function isStripeConfigured() {
  return Boolean(env.STRIPE_SECRET_KEY.trim());
}

export function getStripe() {
  const key = env.STRIPE_SECRET_KEY.trim();
  if (!key) {
    throw new AppError(
      503,
      "Stripe is not configured. Add STRIPE_SECRET_KEY to the backend .env file.",
    );
  }
  if (!client) {
    client = new Stripe(key);
  }
  return client;
}
