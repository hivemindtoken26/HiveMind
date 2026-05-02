import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import type { ViteDevServer } from "vite";

type PaidPlan = "BASIC" | "PRO";

type WebhookEnv = {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  VITE_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

function readRawBody(req: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function getHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getCheckoutPlan(session: Stripe.Checkout.Session): PaidPlan | null {
  const plan = session.metadata?.plan;
  return plan === "BASIC" || plan === "PRO" ? plan : null;
}

function getCheckoutUserId(session: Stripe.Checkout.Session) {
  const userId = session.client_reference_id || session.metadata?.userId;
  return userId && userId !== "anonymous" ? userId : null;
}

export function configureStripeWebhookApi(server: ViteDevServer, env: WebhookEnv) {
  server.middlewares.use("/api/stripe/webhook", async (req, res, next) => {
    if (req.method !== "POST") {
      next();
      return;
    }

    const stripeSecretKey = env.STRIPE_SECRET_KEY;
    const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
    const supabaseUrl = env.VITE_SUPABASE_URL;
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

    if (!stripeSecretKey || !webhookSecret || !supabaseUrl || !serviceRoleKey) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error:
            "Webhook env is missing. Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.",
        }),
      );
      return;
    }

    const stripe = new Stripe(stripeSecretKey);
    const signature = getHeaderValue(req.headers["stripe-signature"]);
    const rawBody = await readRawBody(req);

    if (!signature) {
      res.statusCode = 400;
      res.end("Missing Stripe signature");
      return;
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (error) {
      res.statusCode = 400;
      res.end(`Webhook signature verification failed: ${(error as Error).message}`);
      return;
    }

    try {
      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        const plan = getCheckoutPlan(session);
        const userId = getCheckoutUserId(session);

        if (plan && userId) {
          const supabase = createClient(supabaseUrl, serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { error } = await supabase.from("profiles").upsert({
            id: userId,
            paid_plan: plan,
            updated_at: new Date().toISOString(),
          });

          if (error) {
            throw error;
          }
        }
      }

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ received: true }));
    } catch (error) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Failed to process webhook",
        }),
      );
    }
  });
}
