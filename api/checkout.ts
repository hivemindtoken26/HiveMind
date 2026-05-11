import Stripe from "stripe";
import type { ViteDevServer } from "vite";

type PaidPlan = "PRO";

type CheckoutEnv = {
  STRIPE_SECRET_KEY?: string;
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

function getCheckoutErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "Checkout is temporarily unavailable. Please try again shortly.";
  }

  const message = error.message.toLowerCase();
  if (message.includes("expired api key") || message.includes("invalid api key")) {
    return "Payments are not configured correctly on the server. Please try again later.";
  }
  if (message.includes("no such price")) {
    return "Subscription pricing is not set up yet. Please contact support.";
  }

  return "Checkout could not be started. Please try again in a moment.";
}

async function createCheckoutResponse(
  payload: CheckoutPayload,
  headers: Record<string, string | string[] | undefined>,
  env: CheckoutEnv,
): Promise<JsonResponse> {
  const secretKey = env.STRIPE_SECRET_KEY;
  const proPriceId = env.STRIPE_PRICE_ID_PRO;

  if (!secretKey || !proPriceId) {
    return {
      statusCode: 500,
      body: {
        error: "Payments are not configured. Set STRIPE_SECRET_KEY and STRIPE_PRICE_ID_PRO.",
      },
    };
  }

  const plan = payload.plan;
  if (plan !== "PRO") {
    return { statusCode: 400, body: { error: "Invalid plan" } };
  }

  try {
    const stripe = new Stripe(secretKey);
    const requestOrigin = getHeaderValue(headers.origin);
    const requestHost = getHeaderValue(headers.host);
    const appUrl =
      requestOrigin ||
      env.VITE_APP_URL ||
      (requestHost ? `https://${requestHost}` : "http://localhost:5173");
    const userId = payload.userId?.trim();

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      line_items: [{ price: proPriceId, quantity: 1 }],
      success_url: `${appUrl}/pulse?checkout=success&plan=PRO`,
      cancel_url: `${appUrl}/pulse?checkout=cancel`,
      customer_email: payload.email || undefined,
      metadata: {
        plan: "PRO",
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
        error: getCheckoutErrorMessage(error),
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
    } catch {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Checkout is temporarily unavailable. Please try again shortly.",
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
