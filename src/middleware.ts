import { auth } from "@/auth";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isAuthPage =
    req.nextUrl.pathname.startsWith("/auth/signin") ||
    req.nextUrl.pathname.startsWith("/auth/error");

  if (isAuthPage) {
    if (isLoggedIn) {
      return Response.redirect(new URL("/dashboard", req.url));
    }
    return;
  }

  if (!isLoggedIn) {
    return Response.redirect(new URL("/", req.url));
  }

  return;
});

export const config = {
  matcher: ["/dashboard/:path*", "/auth/signin", "/auth/error"],
};
