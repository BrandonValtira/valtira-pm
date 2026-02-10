import { auth } from "@/auth";
import Link from "next/link";
import { LogoBackground } from "@/components/logo-background";
import { ValtiraLogo } from "@/components/valtira-logo";
import { signOutAction } from "@/app/auth/actions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <div className="relative min-h-screen overflow-hidden bg-neutral-50">
      <LogoBackground position="bottom-right" />
      <div className="relative z-10 min-h-screen">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/dashboard" className="flex items-center">
            <ValtiraLogo height={43} />
          </Link>
          <nav className="flex items-center gap-6">
            <Link
              href="/dashboard"
              className="text-sm text-neutral-600 hover:text-neutral-900"
            >
              My projects
            </Link>
            <Link
              href="/dashboard/settings"
              className="text-sm text-neutral-600 hover:text-neutral-900"
            >
              Settings
            </Link>
            {(session?.user as { role?: string })?.role === "super_admin" ? (
              <Link
                href="/dashboard/team"
                className="text-sm text-neutral-600 hover:text-neutral-900"
              >
                Team
              </Link>
            ) : (
              <span
                className="text-sm text-neutral-400 cursor-not-allowed"
                title="Team management is only available to Super Admins"
              >
                Team
              </span>
            )}
            {session && (
              <div className="ml-4 flex items-center gap-3 border-l border-neutral-200 pl-6">
                {session.user && (
                  <>
                    <span className="text-sm text-neutral-600 truncate max-w-[140px]">
                      {session.user.name ?? session.user.email ?? "Signed in"}
                    </span>
                    {session.user.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={session.user.image}
                        alt=""
                        width={32}
                        height={32}
                        className="h-8 w-8 rounded-full border border-neutral-200 object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-200 text-xs font-medium text-neutral-600">
                        {(session.user.name ?? session.user.email ?? "?")[0].toUpperCase()}
                      </span>
                    )}
                  </>
                )}
                <form action={signOutAction} className="flex items-center">
                  <button
                    type="submit"
                    className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50 hover:border-neutral-300"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </div>
    </div>
  );
}
