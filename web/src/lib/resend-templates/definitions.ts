import {
  buildResendOrderShellTemplateHtml,
  buildResendSignupVerificationTemplateHtml,
} from "@/lib/resend-templates/shell";

export type ResendTemplateVariableDef = {
  key: string;
  type: "string" | "number";
  fallback_value: string | number;
};

export type ResendTemplateDefinition = {
  /** Resend template name / alias (used when sending). */
  name: string;
  subject: string;
  html: string;
  text: string;
  variables: ResendTemplateVariableDef[];
};

/** Published to Resend via `npm run resend:sync-templates`. */
export const RESEND_TEMPLATE_ORDER_SHELL = "gv-order-email-shell";
export const RESEND_TEMPLATE_SIGNUP_VERIFICATION = "gv-signup-verification";

export const RESEND_TEMPLATE_DEFINITIONS: ResendTemplateDefinition[] = [
  {
    name: RESEND_TEMPLATE_ORDER_SHELL,
    subject: "Get Vaulted order update",
    html: buildResendOrderShellTemplateHtml(),
    text: "{{{TEXT_BODY}}}",
    variables: [
      { key: "HEADLINE", type: "string", fallback_value: "Order update" },
      { key: "BODY_HTML", type: "string", fallback_value: "There is an update on your order." },
      { key: "CTA_LABEL", type: "string", fallback_value: "View order" },
      { key: "ORDER_URL", type: "string", fallback_value: "https://shopgetvaulted.com/account/orders" },
      { key: "TEXT_BODY", type: "string", fallback_value: "Get Vaulted order update." },
    ],
  },
  {
    name: RESEND_TEMPLATE_SIGNUP_VERIFICATION,
    subject: "Your Get Vaulted verification code",
    html: buildResendSignupVerificationTemplateHtml(),
    text: [
      "Get Vaulted",
      "",
      "Welcome — you're almost done.",
      "",
      "Enter this code to finish creating your account:",
      "",
      "{{{VERIFICATION_CODE}}}",
      "",
      "{{{EXPIRES_PHRASE}}}",
      "",
      "If you didn't request this, you can safely ignore this email.",
    ].join("\n"),
    variables: [
      { key: "VERIFICATION_CODE", type: "string", fallback_value: "000000" },
      { key: "EXPIRES_PHRASE", type: "string", fallback_value: "This code expires soon." },
    ],
  },
];
