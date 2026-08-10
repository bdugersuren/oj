import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = request.cookies.get("oj_access")?.value;

  // If no token exists, redirect to login page
  if (!token) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  try {
    // Decode JWT payload (second part of the token, base64url encoded)
    const parts = token.split(".");
    if (parts.length !== 3) {
      return NextResponse.redirect(new URL("/auth/login", request.url));
    }
    
    const payloadBase64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const decodedPayload = JSON.parse(atob(payloadBase64));
    const role = decodedPayload.role;

    // Role-based authorization redirects
    if (pathname.startsWith("/admin") && role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    if (pathname.startsWith("/teacher") && role !== "teacher" && role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  } catch (e) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all platform pages, except:
     * - api routes
     * - _next static files and image optimization
     * - favicon.ico
     * - auth routes (login, register, reset, verify)
     * - landing page '/'
     */
    "/((?!api|_next/static|_next/image|favicon.ico|auth|$).*)",
  ],
};
