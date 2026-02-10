import { auth } from "@/auth";
import Link from "next/link";
import { LogoBackground } from "@/components/logo-background";
import { UserMenu } from "@/components/user-menu";
import { ValtiraLogo } from "@/components/valtira-logo";

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
                className="text-sm text-neutral-700 hover:text-neutral-900"
              >
                Team
              </Link>
            ) : (
              <span
                className="text-sm text-neutral-600 cursor-not-allowed"
                title="Team management is only available to Super Admins"
              >
                Team
              </span>
            )}
            {session?.user && <UserMenu user={session.user} />}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </div>
    </div>
  );
}
