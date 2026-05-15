import { SpanStatusCode, trace } from "@opentelemetry/api";

const TRACER_NAME = "get-vaulted-live-auction";
const TRACER_VERSION = "1.0.0";

/** Server spans for bid path / fan-out (no-op if no tracer provider is registered). */
export async function runLiveAuctionSpan<T>(
  name: string,
  attributes: Record<string, string | number | boolean>,
  fn: () => Promise<T>,
): Promise<T> {
  const tracer = trace.getTracer(TRACER_NAME, TRACER_VERSION);
  return tracer.startActiveSpan(name, async (span) => {
    for (const [k, v] of Object.entries(attributes)) {
      span.setAttribute(k, v);
    }
    try {
      return await fn();
    } catch (e) {
      span.recordException(e instanceof Error ? e : new Error(String(e)));
      span.setStatus({ code: SpanStatusCode.ERROR, message: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  });
}
