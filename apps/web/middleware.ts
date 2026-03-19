import { NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  const cookie = request.cookies.get("access_token");

  if (!cookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/auth/me`,
      {
        headers: {
          Cookie: `access_token=${cookie.value}`,
        },
      },
    );

    if (!response.ok) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
