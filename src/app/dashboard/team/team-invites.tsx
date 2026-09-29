"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type User = {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  status: string;
  accepted_at: string | null;
  created_at: string;
};

type Invite = {
  id: string;
  email: string;
  role: string;
  created_at: string;
  expires_at: string;
};

export function TeamInvites({
  users,
  invites,
  currentUserId,
}: {
  users: User[];
  invites: Invite[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"pm" | "super_admin">("pm");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setError("");
    setLoading("invite");
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, role: inviteRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to send invite");
        return;
      }
      setEmail("");
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  async function revoke(inviteId: string) {
    setError("");
    setLoading(`revoke-${inviteId}`);
    try {
      const res = await fetch(`/api/invites/${inviteId}/revoke`, { method: "PATCH" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error || "Failed to revoke");
      else router.refresh();
    } finally {
      setLoading(null);
    }
  }

  async function resend(inviteId: string) {
    setError("");
    setLoading(`resend-${inviteId}`);
    try {
      const res = await fetch(`/api/invites/${inviteId}/resend`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error || "Failed to resend");
      else router.refresh();
    } finally {
      setLoading(null);
    }
  }

  async function saveRole(userId: string, role: "pm" | "super_admin") {
    setError("");
    setLoading(`role-${userId}`);
    try {
      const res = await fetch(`/api/team/members/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error || "Failed to save role");
      else router.refresh();
    } finally {
      setLoading(null);
    }
  }

  async function revokeMember(userId: string) {
    if (!confirm("Revoke this person’s access? They won’t be able to sign in until invited again.")) return;
    setError("");
    setLoading(`revoke-member-${userId}`);
    try {
      const res = await fetch(`/api/team/members/${userId}/revoke`, { method: "PATCH" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error || "Failed to revoke");
      else router.refresh();
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="mt-8 space-y-8">
      <div className="rounded-xl border border-neutral-200 bg-white p-6">
        <h2 className="text-sm font-medium text-neutral-900">Invite by email</h2>
        <p className="mt-1 text-sm text-neutral-700">
          They’ll get an email with a link to accept. After accepting, they sign in with Google and can connect Harvest & Jira in Settings.
        </p>
        <form onSubmit={handleInvite} className="mt-4 flex flex-wrap items-center gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="pm@example.com"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm w-64"
            required
          />
          <div className="relative">
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "pm" | "super_admin")}
              className="appearance-none rounded-md border border-neutral-300 pl-3 pr-8 py-2 text-sm text-neutral-900 bg-white"
            >
              <option value="pm">Project Manager</option>
              <option value="super_admin">Super Admin</option>
            </select>
            <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-neutral-500">
              <svg
                viewBox="0 0 20 20"
                aria-hidden="true"
                className="h-4 w-4"
              >
                <path
                  d="M5.25 7.5L10 12.25L14.75 7.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </div>
          <button
            type="submit"
            disabled={!!loading}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {loading === "invite" ? "Sending…" : "Send invite"}
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      {invites.length > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="text-sm font-medium text-neutral-900">Pending invites</h2>
          <p className="mt-1 text-sm text-neutral-700">Revoke to invalidate the link, or resend to send a new email.</p>
          <ul className="mt-4 divide-y divide-neutral-100">
            {invites.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-neutral-900">{inv.email}</span>
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
                    {inv.role === "super_admin" ? "Super Admin" : "Project Manager"}
                  </span>
                </div>
                <span className="text-xs text-neutral-700">
                  Expires {new Date(inv.expires_at).toLocaleDateString()}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => resend(inv.id)}
                    disabled={!!loading}
                    className="text-sm text-neutral-600 underline hover:text-neutral-900 disabled:opacity-50"
                  >
                    {loading === `resend-${inv.id}` ? "Sending…" : "Resend"}
                  </button>
                  <button
                    type="button"
                    onClick={() => revoke(inv.id)}
                    disabled={!!loading}
                    className="text-sm text-red-600 underline hover:text-red-800 disabled:opacity-50"
                  >
                    {loading === `revoke-${inv.id}` ? "Revoking…" : "Revoke"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-neutral-200 bg-white p-6">
        <h2 className="text-sm font-medium text-neutral-900">Team members</h2>
        <p className="mt-1 text-sm text-neutral-700">
          Active members can be a Project Manager or Super Admin. Change the role and save it whenever you need to.
          Someone stays invited until they open the invite link and sign in with the same Google email.
        </p>
        {users.length > 0 ? (
          <ul className="mt-4 divide-y divide-neutral-100">
            {users.map((u) => (
              <MemberRow
                key={`${u.id}-${u.role}`}
                user={u}
                isSelf={u.id === currentUserId}
                loading={loading}
                onSaveRole={saveRole}
                onRevoke={revokeMember}
              />
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-neutral-700">No team members yet.</p>
        )}
      </div>
    </div>
  );
}

function MemberRow({
  user,
  isSelf,
  loading,
  onSaveRole,
  onRevoke,
}: {
  user: User;
  isSelf: boolean;
  loading: string | null;
  onSaveRole: (userId: string, role: "pm" | "super_admin") => void;
  onRevoke: (userId: string) => void;
}) {
  const savedRole: "pm" | "super_admin" = user.role === "super_admin" ? "super_admin" : "pm";
  const [role, setRole] = useState<"pm" | "super_admin">(savedRole);
  const canEditRole = user.status === "active" && !isSelf;
  const saving = loading === `role-${user.id}`;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0">
      <div className="min-w-0">
        <span className="font-medium text-neutral-900">{user.name || user.email}</span>
        {isSelf && <span className="ml-2 text-xs text-neutral-500">You</span>}
        <span className="ml-2 text-sm text-neutral-700">{user.email}</span>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {canEditRole ? (
          <>
            <label className="sr-only" htmlFor={`role-${user.id}`}>
              Role for {user.name || user.email}
            </label>
            <div className="relative">
              <select
                id={`role-${user.id}`}
                value={role}
                onChange={(e) => setRole(e.target.value as "pm" | "super_admin")}
                disabled={!!loading}
                className="appearance-none rounded-md border border-neutral-300 bg-white py-1.5 pl-3 pr-8 text-sm text-neutral-900"
              >
                <option value="pm">Project Manager</option>
                <option value="super_admin">Super Admin</option>
              </select>
              <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-neutral-500">
                <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4">
                  <path
                    d="M5.25 7.5L10 12.25L14.75 7.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </div>
            <button
              type="button"
              onClick={() => onSaveRole(user.id, role)}
              disabled={!!loading}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </>
        ) : (
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
            {savedRole === "super_admin" ? "Super Admin" : "Project Manager"}
          </span>
        )}
        {user.status === "invited" ? (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">
            Invited — sign in pending
          </span>
        ) : (
          <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
            Active
          </span>
        )}
        {user.status === "active" && !isSelf && user.role !== "super_admin" && (
          <button
            type="button"
            onClick={() => onRevoke(user.id)}
            disabled={!!loading}
            className="text-sm text-red-600 underline hover:text-red-800 disabled:opacity-50"
          >
            {loading === `revoke-member-${user.id}` ? "Revoking…" : "Revoke"}
          </button>
        )}
      </div>
    </li>
  );
}
