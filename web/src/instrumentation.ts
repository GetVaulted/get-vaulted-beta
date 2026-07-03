export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  } else if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }

  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertProductionServerEnv } = await import("@/lib/env-production");
  assertProductionServerEnv();

  const otlp =
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim() ||
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!otlp) return;

  try {
    const [{ NodeSDK }, { OTLPTraceExporter }, { Resource }, semconv] = await Promise.all([
      import("@opentelemetry/sdk-node"),
      import("@opentelemetry/exporter-trace-otlp-http"),
      import("@opentelemetry/resources"),
      import("@opentelemetry/semantic-conventions"),
    ]);
    const serviceName = process.env.OTEL_SERVICE_NAME?.trim() || "get-vaulted";
    const traceUrl = otlp.includes("/v1/traces") ? otlp : `${otlp.replace(/\/$/, "")}/v1/traces`;
    const ATTR_SERVICE_NAME = semconv.ATTR_SERVICE_NAME;
    const sdk = new NodeSDK({
      resource: new Resource({ [ATTR_SERVICE_NAME]: serviceName }),
      traceExporter: new OTLPTraceExporter({ url: traceUrl }),
    });
    sdk.start();
  } catch (e) {
    console.error("[instrumentation] OpenTelemetry init failed", e);
  }
}

export async function onRequestError(
  ...args: Parameters<typeof import("@sentry/nextjs").captureRequestError>
) {
  if (!process.env.SENTRY_DSN?.trim()) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
}
