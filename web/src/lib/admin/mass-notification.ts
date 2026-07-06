/** Pure constants/validation for admin mass notifications — safe to import from client components. */

export const MASS_NOTIFICATION_TITLE_MAX = 200;
export const MASS_NOTIFICATION_BODY_MAX = 500;
export const MASS_NOTIFICATION_HREF_MAX = 2000;
export const MASS_NOTIFICATION_IDEMPOTENCY_KEY_MAX = 128;
export const NOTIFICATION_BROADCAST_TYPE = "admin_announcement";

export type MassNotificationInput = {
  title: string;
  body: string;
  href?: string | null;
  /** Client-generated key, one per compose+send attempt — guards against duplicate sends. */
  idempotencyKey?: string | null;
};

export type MassNotificationFieldError = {
  field: "title" | "body" | "href";
  message: string;
};

export function validateMassNotificationInput(input: MassNotificationInput): MassNotificationFieldError | null {
  const title = input.title.trim();
  const body = input.body.trim();
  const href = input.href?.trim() ?? "";

  if (!title) return { field: "title", message: "Title is required." };
  if (title.length > MASS_NOTIFICATION_TITLE_MAX) {
    return { field: "title", message: `Title must be ${MASS_NOTIFICATION_TITLE_MAX} characters or fewer.` };
  }
  if (!body) return { field: "body", message: "Message is required." };
  if (body.length > MASS_NOTIFICATION_BODY_MAX) {
    return { field: "body", message: `Message must be ${MASS_NOTIFICATION_BODY_MAX} characters or fewer.` };
  }
  if (href) {
    if (href.length > MASS_NOTIFICATION_HREF_MAX) return { field: "href", message: "Link is too long." };
    const isRelative = href.startsWith("/");
    const isAbsoluteHttp = /^https?:\/\//i.test(href);
    if (!isRelative && !isAbsoluteHttp) {
      return { field: "href", message: "Link must start with / or http:// or https://." };
    }
  }
  return null;
}
