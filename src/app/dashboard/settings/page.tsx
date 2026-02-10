import Link from "next/link";
import { Suspense } from "react";
import { HarvestConnectForm } from "./harvest-connect-form";
import { JiraConnectForm } from "./jira-connect-form";

export default function SettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-neutral-900">Settings</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Connect Harvest and Jira so you can link them to projects and use them in reports and context.
      </p>

      <Suspense fallback={<SettingsFormsFallback />}>
        <div className="mt-8 space-y-8">
          <section className="rounded-xl border border-neutral-200 bg-white p-6">
            <h2 className="text-lg font-medium text-neutral-900">Harvest</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Used to pull projects and time entries for reports. Sign in with your Harvest account.
            </p>
            <HarvestConnectForm className="mt-4" />
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white p-6">
            <h2 className="text-lg font-medium text-neutral-900">Jira</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Used for project context and to show tickets in reports. Sign in with your Atlassian account.
            </p>
            <JiraConnectForm className="mt-4" />
          </section>
        </div>
      </Suspense>

      <p className="mt-8 text-sm text-neutral-500">
        <Link href="/dashboard" className="text-neutral-700 hover:underline">
          ← Back to projects
        </Link>
      </p>
    </div>
  );
}

function SettingsFormsFallback() {
  return (
    <div className="mt-8 space-y-8">
      <section className="rounded-xl border border-neutral-200 bg-white p-6">
        <h2 className="text-lg font-medium text-neutral-900">Harvest</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Used to pull projects and time entries for reports. Sign in with your Harvest account.
        </p>
        <div className="mt-4 h-10 w-48 animate-pulse rounded-md bg-neutral-100" />
      </section>
      <section className="rounded-xl border border-neutral-200 bg-white p-6">
        <h2 className="text-lg font-medium text-neutral-900">Jira</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Used for project context and to show tickets in reports. Sign in with your Atlassian account.
        </p>
        <div className="mt-4 h-10 w-48 animate-pulse rounded-md bg-neutral-100" />
      </section>
    </div>
  );
}
