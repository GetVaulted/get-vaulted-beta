import Stripe from "stripe";

export function stripeRouteErrorResponse(
  context: string,
  e: unknown,
): { status: number; body: { error: string; code?: string } } {
  if (e instanceof Stripe.errors.StripeError) {
    const code = e.code ?? e.type;
    console.error(`[${context}] Stripe error`, {
      type: e.type,
      code: e.code,
      message: e.message,
      statusCode: e.statusCode,
    });
    return {
      status: typeof e.statusCode === "number" && e.statusCode >= 400 && e.statusCode < 600 ? e.statusCode : 502,
      body: {
        error: e.message || "Stripe request failed.",
        code: typeof code === "string" ? code : undefined,
      },
    };
  }
  if (e instanceof Error && e.message === "USER_NOT_FOUND") {
    return { status: 404, body: { error: "User not found." } };
  }
  console.error(`[${context}] unhandled`, e);
  const message = e instanceof Error ? e.message : "Unexpected server error.";
  return { status: 500, body: { error: message.slice(0, 500) } };
}
