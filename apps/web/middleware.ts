import { NextResponse } from "next/server";

// The authenticated session cookie is created by the API domain, not by the
// Next.js app domain. Middleware on the app domain cannot reliably inspect that
// cookie, so auth must be enforced by client requests to the API instead.
export function middleware() {
  return NextResponse.next();
}
