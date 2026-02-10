/**
 * Canonical base URL for the app. Never returns undefined.
 * Use for redirects, email links, and anywhere a full URL is needed.
 * Vercel sets VERCEL_URL automatically in production.
 */
export function getAppBaseUrl(): string {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL.replace(/\/$/, "");
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  return process.env.NODE_ENV === "production"
    ? "https://brandonvaltira-valtira-pm.vercel.app"
    : "http://localhost:3000";
}
