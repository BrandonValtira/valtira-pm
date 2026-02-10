import Link from "next/link";
import { NewProjectForm } from "./new-project-form";

export default function NewProjectPage() {
  return (
    <div>
      <Link
        href="/dashboard"
        className="text-sm text-neutral-500 hover:text-neutral-700"
      >
        ← Back to projects
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-neutral-900">
        Add project
      </h1>
      <p className="mt-2 text-sm text-neutral-600">
        Name your project, link one or more Harvest projects for hours, add client emails for reports, and optional Jira project keys for context.
      </p>
      <NewProjectForm className="mt-8" />
    </div>
  );
}
