import { redirect } from "next/navigation";

type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

/** Settings is now on the dashboard (Accounts). Redirect so old links and OAuth callbacks still work. */
export default async function SettingsPage({ searchParams }: Props) {
  const params = searchParams ? await searchParams : {};
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (typeof v === "string") search.set(k, v);
    else if (Array.isArray(v) && v[0]) search.set(k, v[0]);
  });
  const qs = search.toString();
  redirect(qs ? `/dashboard?${qs}` : "/dashboard");
}
