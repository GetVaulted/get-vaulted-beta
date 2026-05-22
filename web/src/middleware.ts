import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { isLiveMarketplaceBlocked } from "@/lib/live-coming-soon";
import { isPublicLiveRoomsBuyerRead } from "@/lib/public-live-rooms-read";

let loggedMissingNextAuthSecret = false;

const LIVE_COMING_SOON_JSON = {
  error: "Live marketplace is not available yet.",
  code: "LIVE_COMING_SOON" as const,
};

const protectedMatchers = [
  /^\/sell\/create$/,
  /^\/account(\/.*)?$/,
  /^\/seller\/listings\/?$/,
  /^\/seller\/listings(\/.+)?$/,
  /^\/seller\/live(\/.*)?$/,
  /^\/checkout(\/.*)?$/,
  /^\/orders(\/.*)?$/,
];

function isProtectedPath(pathname: string): boolean {
  return protectedMatchers.some((re) => re.test(pathname));
}

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const secret = process.env.NEXTAUTH_SECRET;
  if (process.env.NODE_ENV === "production" && !secret?.trim() && !loggedMissingNextAuthSecret) {
    loggedMissingNextAuthSecret = true;
    console.error(
      "NEXTAUTH_SECRET is missing: JWT verification and auth redirects may be broken. Set it before going live (see README.md).",
    );
  }

  if (pathname.startsWith("/admin")) {
    const token = await getToken({ req: request, secret });
    if (!token?.sub) {
      const url = new URL("/signin", request.url);
      url.searchParams.set("returnTo", pathname);
      return NextResponse.redirect(url);
    }
    if (token.role !== "admin") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (isLiveMarketplaceBlocked()) {
    if (pathname.startsWith("/api/live-rooms") && !isPublicLiveRoomsBuyerRead(request)) {
      return NextResponse.json(LIVE_COMING_SOON_JSON, {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (pathname === "/api/seller/live-readiness") {
      return NextResponse.json(LIVE_COMING_SOON_JSON, {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (pathname === "/live" || pathname.startsWith("/live/")) {
      return NextResponse.redirect(new URL("/coming-soon", request.url));
    }
    if (pathname === "/seller/live" || pathname.startsWith("/seller/live/")) {
      return NextResponse.redirect(new URL("/coming-soon", request.url));
    }
  }

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  const token = await getToken({ req: request, secret });
  if (!token?.sub) {
    const url = new URL("/signin", request.url);
    url.searchParams.set("returnTo", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/sell/create",
    "/account/:path*",
    "/seller/listings",
    "/seller/listings/:path*",
    "/seller/live",
    "/seller/live/:path*",
    "/live",
    "/live/:path*",
    "/api/live-rooms",
    "/api/live-rooms/:path*",
    "/api/seller/live-readiness",
    "/checkout/:path*",
    "/orders/:path*",
    "/admin/:path*",
  ],
};
