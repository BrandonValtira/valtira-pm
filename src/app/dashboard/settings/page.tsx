import Link from "next/link";
import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { HarvestConnectForm } from "./harvest-connect-form";
import { JiraConnectForm } from "./jira-connect-form";

export default async function SettingsPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;

  const supabase = createAdminClient();
  const { data: integrations } = userId
    ? await supabase
        .from("user_integrations")
        .select("provider")
        .eq("user_id", userId)
        .not("access_token", "is", null)
    : { data: [] };

  const connectedProviders = new Set((integrations ?? []).map((r) => r.provider as string));
  const harvestConnected = connectedProviders.has("harvest");
  const jiraConnected = connectedProviders.has("jira");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-neutral-900">Settings</h1>
      <p className="mt-1 text-sm text-neutral-700">
        Connect Harvest and Jira so you can link them to projects and use them in reports and context.
      </p>

      <div className="mt-8 space-y-8">
        <section className="rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-medium text-neutral-900">Harvest</h2>
          <p className="mt-1 text-sm text-neutral-700">
            Used to pull projects and time entries for reports.
          </p>
          <HarvestConnectForm className="mt-4" connected={harvestConnected} />
        </section>

        <section className="rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-medium text-neutral-900">Jira</h2>
          <p className="mt-1 text-sm text-neutral-700">
            Used for project context and to show tickets in reports.
          </p>
          <JiraConnectForm className="mt-4" connected={jiraConnected} />
        </section>
      </div>

      <p className="mt-8 text-sm text-neutral-700">
        <Link href="/dashboard" className="text-neutral-700 hover:underline">
          ← Back to projects
        </Link>
      </p>
    </div>
  );
}
