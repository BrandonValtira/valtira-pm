import { auth } from "@/auth";
import Link from "next/link";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { LogoBackground } from "@/components/logo-background";
import { ValtiraLogo } from "@/components/valtira-logo";

const TAGLINE = "Project management and client reporting assistant";

export default async function HomePage() {
  const session = await auth();

  return (
    <div className="relative min-h-screen overflow-hidden bg-neutral-50">
      <LogoBackground position="bottom-right" />
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-[380px] rounded-3xl border border-neutral-200/80 bg-white p-10 shadow-xl shadow-neutral-200/50">
          <div className="flex justify-center">
            <ValtiraLogo height={48} />
          </div>
          <p className="mt-3 text-center text-sm leading-relaxed text-neutral-500">
            {TAGLINE}
          </p>
          {session ? (
            <Link
              href="/dashboard"
              className="mt-8 flex w-full items-center justify-center rounded-xl bg-neutral-900 px-4 py-3.5 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 active:scale-[0.99]"
            >
              Go to dashboard
            </Link>
          ) : (
            <GoogleSignInButton className="mt-8 flex w-full items-center justify-center gap-3 rounded-xl bg-neutral-900 px-4 py-3.5 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 active:scale-[0.99]" />
          )}
          <p className="mt-6 text-center text-xs text-neutral-400">
            Invite-only. Contact your admin for access.
          </p>
        </div>
      </div>
    </div>
  );
}
