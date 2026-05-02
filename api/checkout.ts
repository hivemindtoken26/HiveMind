import Stripe from "stripe";
import type { ViteDevServer } from "vite";

type PaidPlan = "BASIC" | "PRO";

type CheckoutEnv = {
  STRIPE_SECRET_KEY?: string;
  STRIPE_PRICE_ID_BASIC?: string;
  STRIPE_PRICE_ID_PRO?: string;
  VITE_APP_URL?: string;
};

type CheckoutPayload = {
  plan?: PaidPlan;
  email?: string;
  userId?: string;
};

type JsonResponse = {
  statusCode: number;
  body: { url?: string; error?: string };
};

type ServerlessRequest = NodeJS.ReadableStream & {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type ServerlessResponse = {
  status(statusCode: number): ServerlessResponse;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
};

function readRequestBody(req: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function getHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function createCheckoutResponse(
  payload: CheckoutPayload,
  headers: Record<string, string | string[] | undefined>,
  env: CheckoutEnv,
): Promise<JsonResponse> {
  const secretKey = env.STRIPE_SECRET_KEY;
  const basicPriceId = env.STRIPE_PRICE_ID_BASIC;
  const proPriceId = env.STRIPE_PRICE_ID_PRO;

  if (!secretKey || !basicPriceId || !proPriceId) {
    return {
      statusCode: 500,
      body: {
        error:
          "Stripe env is missing. Set STRIPE_SECRET_KEY, STRIPE_PRICE_ID_BASIC, and STRIPE_PRICE_ID_PRO.",
      },
    };
  }

  const plan = payload.plan;
  if (plan !== "BASIC" && plan !== "PRO") {
    return { statusCode: 400, body: { error: "Invalid plan" } };
  }

  try {
    const stripe = new Stripe(secretKey);
    const priceId = plan === "BASIC" ? basicPriceId : proPriceId;
    const requestOrigin = getHeaderValue(headers.origin);
    const requestHost = getHeaderValue(headers.host);
    const appUrl =
      requestOrigin ||
      env.VITE_APP_URL ||
      (requestHost ? `https://${requestHost}` : "http://localhost:5173");
    const userId = payload.userId?.trim();

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/pulse?checkout=success&plan=${plan}`,
      cancel_url: `${appUrl}/pulse?checkout=cancel`,
      customer_email: payload.email || undefined,
      metadata: {
        plan,
        userId: userId || "anonymous",
      },
    };

    if (userId) {
      sessionParams.client_reference_id = userId;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    return { statusCode: 200, body: { url: session.url ?? undefined } };
  } catch (error) {
    return {
      statusCode: 500,
      body: {
        error: error instanceof Error ? error.message : "Failed to create checkout session",
      },
    };
  }
}

export function configureStripeCheckoutApi(server: ViteDevServer, env: CheckoutEnv) {
  server.middlewares.use("/api/checkout", async (req, res, next) => {
    if (req.method !== "POST") {
      next();
      return;
    }

    try {
      const payload = JSON.parse(await readRequestBody(req)) as CheckoutPayload;
      const result = await createCheckoutResponse(payload, req.headers, env);
      res.statusCode = result.statusCode;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(result.body));
    } catch (error) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Failed to create checkout session",
        }),
      );
    }
  });
}

export default async function handler(req: ServerlessRequest, res: ServerlessResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const payload =
    typeof req.body === "string"
      ? (JSON.parse(req.body) as CheckoutPayload)
      : (req.body as CheckoutPayload | undefined) ?? {};
  const result = await createCheckoutResponse(payload, req.headers, process.env);
  res.status(result.statusCode).json(result.body);
}
