import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const cookieToken = request.cookies.get("cognito-access-token")?.value;

  if (!authorization && !cookieToken) {
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set("returnTo", request.nextUrl.pathname);
    return NextResponse.redirect(signIn);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
