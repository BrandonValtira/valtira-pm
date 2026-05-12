/**
 * Canonical base URL for the app. Never returns undefined.
 * Use for redirects, email links, and anywhere a full URL is needed.
 * Prefer APP_URL / NEXTAUTH_URL so invite and other emails always use your
 * production domain (e.g. pm.valtira.net), not the *.vercel.app deployment URL,
 * which can trigger Vercel Deployment Protection when recipients click the link.
 */
export function getAppBaseUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL.replace(/\/$/, "");
  if (process.env.AUTH_URL) return process.env.AUTH_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return process.env.NODE_ENV === "production"
    ? "https://pm.valtira.net"
    : "http://localhost:3000";
}
