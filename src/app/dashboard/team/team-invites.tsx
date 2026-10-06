"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type User = {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  status: string;
  accepted_at: string | null;
  created_at: string;
  org_connection?: boolean;
};

type AccountConnections = { harvest: boolean; jira: boolean };

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
  orgConnectionUserId,
  connections,
}: {
  users: User[];
  invites: Invite[];
  currentUserId: string;
  orgConnectionUserId: string;
  connections: Record<string, AccountConnections>;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"pm" | "super_admin">("pm");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [roleError, setRoleError] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [roleTarget, setRoleTarget] = useState<User | null>(null);
  const [draftRole, setDraftRole] = useState<"pm" | "super_admin">("pm");

  useEffect(() => {
    if (!openMenuId) return;
    function close() {
      setOpenMenuId(null);
    }
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [openMenuId]);

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

  function openChangeRole(user: User) {
    setOpenMenuId(null);
    setRoleError("");
    setRoleTarget(user);
    setDraftRole(user.role === "super_admin" ? "super_admin" : "pm");
  }

  async function saveRole() {
    if (!roleTarget) return;
    const savedRole: "pm" | "super_admin" = roleTarget.role === "super_admin" ? "super_admin" : "pm";
    if (draftRole === savedRole) return;
    setRoleError("");
    setLoading(`role-${roleTarget.id}`);
    try {
      const res = await fetch(`/api/team/members/${roleTarget.id}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: draftRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRoleError(data.error || "Failed to save role");
        return;
      }
      setRoleTarget(null);
      router.refresh();
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
        <h2 className="text-base font-bold text-neutral-900">Invite by email</h2>
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
        <h2 className="text-base font-bold text-neutral-900">Team members</h2>
        <p className="mt-1 text-sm text-neutral-700">
          Active members can be a Project Manager or Super Admin. Change the role and save it whenever you need to.
          Someone stays invited until they open the invite link and sign in with the same Google email.
        </p>
        {users.length > 0 ? (
          <ul className="mt-4 divide-y divide-neutral-100">
            {users.map((u) => (
              <MemberRow
                key={`${u.id}-${u.role}-${u.status}`}
                user={u}
                isSelf={u.id === currentUserId}
                isOrgConnection={u.id === orgConnectionUserId}
                menuOpen={openMenuId === u.id}
                loading={loading}
                onToggleMenu={() => setOpenMenuId((current) => (current === u.id ? null : u.id))}
                onChangeRole={() => openChangeRole(u)}
                onRevoke={() => {
                  setOpenMenuId(null);
                  revokeMember(u.id);
                }}
              />
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-neutral-700">No team members yet.</p>
        )}
      </div>

      <CompanyLogins
        users={users}
        orgConnectionUserId={orgConnectionUserId}
        connections={connections}
      />

      {roleTarget && (
        <RoleDialog
          user={roleTarget}
          draftRole={draftRole}
          saving={loading === `role-${roleTarget.id}`}
          error={roleError}
          onRoleChange={setDraftRole}
          onClose={() => {
            if (loading) return;
            setRoleTarget(null);
            setRoleError("");
          }}
          onSave={saveRole}
        />
      )}
    </div>
  );
}

function CompanyLogins({
  users,
  orgConnectionUserId,
  connections,
}: {
  users: User[];
  orgConnectionUserId: string;
  connections: Record<string, AccountConnections>;
}) {
  const router = useRouter();
  const superAdmins = users.filter((user) => user.role === "super_admin" && user.status === "active");
  const [draftId, setDraftId] = useState(orgConnectionUserId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setDraftId(orgConnectionUserId);
  }, [orgConnectionUserId]);

  const selected = superAdmins.find((user) => user.id === draftId) ?? null;
  const linked = connections[draftId] ?? { harvest: false, jira: false };
  const changed = draftId !== orgConnectionUserId && draftId !== "";

  async function save() {
    if (!changed) return;
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/team/org-connection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: draftId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to save company logins");
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6">
      <h2 className="text-base font-bold text-neutral-900">Company Data Connections</h2>
      <div className="mt-2 space-y-3 text-sm text-neutral-700">
        <p>
          The Valtira PM app uses connected accounts from a Super Admin to access company-wide data from
          Harvest and Jira.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Harvest: Provides projects, reported hours, resource planning data, and the team directory.</li>
          <li>
            Jira: Provides company project data. If the Super Admin does not have Jira connected, the app will
            use another authorized Jira connection.
          </li>
        </ul>
        <p>
          The Company Data Connection user must be a Super Admin in Valtira PM and have the appropriate external
          accounts connected under Accounts.
        </p>
        <p>
          Changing the Company Data Connection user does not transfer account connections. The new user must connect
          the required accounts, then sign out and back in before their access is used.
        </p>
      </div>
      {superAdmins.length > 0 ? (
        <div className="mt-4">
          <label className="block text-sm font-medium text-neutral-900" htmlFor="org-connection-user">
            Company Data Connection
          </label>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[16rem] flex-1">
              <select
                id="org-connection-user"
                value={draftId}
                onChange={(event) => setDraftId(event.target.value)}
                disabled={saving}
                className="w-full appearance-none rounded-md border border-neutral-300 bg-white py-2 pl-3 pr-8 text-sm text-neutral-900"
              >
                {superAdmins.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name || user.email}
                    {user.email && user.name ? ` · ${user.email}` : ""}
                  </option>
                ))}
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
            {changed && (
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            )}
          </div>
          {selected && !linked.harvest && (
            <p className="mt-1 text-sm text-amber-800">
              Harvest needs to be connected on this account before company projects can load.
            </p>
          )}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
      ) : (
        <p className="mt-4 text-sm text-neutral-700">No active super admins to assign.</p>
      )}
    </section>
  );
}

function MemberRow({
  user,
  isSelf,
  isOrgConnection,
  menuOpen,
  loading,
  onToggleMenu,
  onChangeRole,
  onRevoke,
}: {
  user: User;
  isSelf: boolean;
  isOrgConnection: boolean;
  menuOpen: boolean;
  loading: string | null;
  onToggleMenu: () => void;
  onChangeRole: () => void;
  onRevoke: () => void;
}) {
  const savedRole: "pm" | "super_admin" = user.role === "super_admin" ? "super_admin" : "pm";
  const showMenu = !isSelf && (user.status === "active" || user.status === "invited");
  const label = user.name || user.email || "team member";

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-neutral-900">{user.name || user.email}</span>
          {isSelf && <span className="text-xs text-neutral-500">You</span>}
          {isOrgConnection && (
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-900">
              Company Data Connection Admin
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          <span className="text-sm text-neutral-700">{user.email}</span>
          {user.status === "invited" ? (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">
              Invited — sign in pending
            </span>
          ) : (
            <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
              Active
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
          {savedRole === "super_admin" ? "Super Admin" : "Project Manager"}
        </span>
        {showMenu && (
          <div className="relative" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={`Actions for ${label}`}
              onClick={onToggleMenu}
              disabled={!!loading}
              className="rounded-md p-1.5 text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
            >
              <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5">
                <circle cx="10" cy="4.5" r="1.25" fill="currentColor" />
                <circle cx="10" cy="10" r="1.25" fill="currentColor" />
                <circle cx="10" cy="15.5" r="1.25" fill="currentColor" />
              </svg>
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 z-20 mt-1 w-40 rounded-md border border-neutral-200 bg-white py-1 shadow-lg"
              >
                {user.status === "active" && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={onChangeRole}
                    className="block w-full px-3 py-2 text-left text-sm text-neutral-900 hover:bg-neutral-50"
                  >
                    Change role
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={onRevoke}
                  disabled={!!loading}
                  className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-neutral-50 disabled:opacity-50"
                >
                  {loading === `revoke-member-${user.id}` ? "Revoking…" : "Revoke"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function RoleDialog({
  user,
  draftRole,
  saving,
  error,
  onRoleChange,
  onClose,
  onSave,
}: {
  user: User;
  draftRole: "pm" | "super_admin";
  saving: boolean;
  error: string;
  onRoleChange: (role: "pm" | "super_admin") => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const savedRole: "pm" | "super_admin" = user.role === "super_admin" ? "super_admin" : "pm";
  const changed = draftRole !== savedRole;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation">
      <button type="button" aria-label="Close" className="absolute inset-0" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-role-title"
        className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-lg"
      >
        <h3 id="change-role-title" className="text-base font-semibold text-neutral-900">
          Change role
        </h3>
        <p className="mt-1 text-sm text-neutral-700">
          {user.name || user.email}
          {user.email && user.name ? ` · ${user.email}` : ""}
        </p>
        <label className="mt-4 block text-sm font-medium text-neutral-900" htmlFor="member-role">
          Role
        </label>
        <div className="relative mt-1">
          <select
            id="member-role"
            value={draftRole}
            onChange={(e) => onRoleChange(e.target.value as "pm" | "super_admin")}
            disabled={saving}
            className="w-full appearance-none rounded-md border border-neutral-300 bg-white py-2 pl-3 pr-8 text-sm text-neutral-900"
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
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
          >
            Cancel
          </button>
          {changed && (
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
