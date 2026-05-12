import { auth } from "@/auth";
import { DashboardBackground } from "@/components/dashboard-background";
import { DashboardHeader } from "@/components/dashboard-header";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { ThemeProvider } from "@/components/theme-context";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <ThemeProvider>
    <div className="relative min-h-screen bg-neutral-50">
      <DashboardBackground />
      <div className="relative z-10 flex min-h-screen flex-col">
        <DashboardHeader sessionUser={session?.user ?? null} />
        <div className="flex flex-1 min-h-0">
          <DashboardSidebar sessionUser={session?.user ?? null} />
          <main className="min-w-0 flex-1 px-4 py-8 pl-14 md:pl-4">
            <div className="mx-auto max-w-6xl">{children}</div>
          </main>
        </div>
      </div>
    </div>
    </ThemeProvider>
  );
}
