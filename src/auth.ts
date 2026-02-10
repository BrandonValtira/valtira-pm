import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { createAdminClient } from "@/lib/supabase/admin";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, profile }) {
      // Google can put email on user or profile
      const email = (user?.email ?? (profile as { email?: string })?.email)?.trim();
      if (!email) return false;
      const userEmail = email.toLowerCase();

      // Super admin: check env first, then explicit allowlist (in case env isn't loaded)
      const superAdminFromEnv = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase()
        || process.env.AUTH_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
      const superAdminAllowlist = ["brandon.johnson@valtira.net"];
      const isSuperAdmin =
        (superAdminFromEnv && userEmail === superAdminFromEnv) ||
        superAdminAllowlist.includes(userEmail);

      const userWithEmail = { ...user, email };

      if (isSuperAdmin) {
        try {
          const supabase = createAdminClient();
          await upsertUser(supabase, userWithEmail);
        } catch {
          // Allow sign-in even if upsert fails
        }
        return true;
      }

      // Anyone else must exist in DB (invited/active) or have a pending invite
      const supabase = createAdminClient();
      const { data: dbUser } = await supabase
        .from("users")
        .select("id, status, role")
        .eq("email", userEmail)
        .single();

      if (dbUser) {
        if (dbUser.status !== "invited" && dbUser.status !== "active") return false;
        await upsertUser(supabase, userWithEmail);
        return true;
      }

      // No user yet: allow if they have a pending invite (they'll get a user on first sign-in)
      const { data: pendingInvite } = await supabase
        .from("invites")
        .select("id")
        .eq("email", userEmail)
        .is("used_at", null)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .limit(1)
        .single();
      if (!pendingInvite) return false;
      await upsertUser(supabase, userWithEmail);
      return true;
    },
    async session({ session }) {
      if (session.user) {
        const supabase = createAdminClient();
        const { data: dbUser } = await supabase
          .from("users")
          .select("id, role, status")
          .eq("email", session.user.email!)
          .single();
        if (dbUser) {
          session.user.id = dbUser.id;
          session.user.role = dbUser.role as "super_admin" | "pm";
          session.user.status = dbUser.status as "invited" | "active";
        }
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user?.email) token.email = user.email;
      return token;
    },
  },
  pages: {
    signIn: "/",
    error: "/auth/error",
  },
});

async function upsertUser(
  supabase: ReturnType<typeof createAdminClient>,
  user: { id?: string; email?: string | null; name?: string | null; image?: string | null }
) {
  const superAdminFromEnv = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase()
    || process.env.AUTH_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const superAdminAllowlist = ["brandon.johnson@valtira.net"];
  const userEmail = user.email?.trim().toLowerCase();
  const isSuperAdmin =
    (superAdminFromEnv && userEmail === superAdminFromEnv) ||
    (userEmail ? superAdminAllowlist.includes(userEmail) : false);

  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("email", user.email!)
    .single();

  if (existing) {
    await supabase
      .from("users")
      .update({
        name: user.name ?? undefined,
        image: user.image ?? undefined,
        status: "active",
        accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...(isSuperAdmin ? { role: "super_admin" } : {}),
      })
      .eq("id", existing.id);
    return;
  }

  // New user: if not super admin, link to pending invite and use invite role
  let invitedBy: string | null = null;
  let inviteRole: "super_admin" | "pm" = "pm";
  if (!isSuperAdmin && userEmail) {
    const { data: inv } = await supabase
      .from("invites")
      .select("created_by_user_id, role")
      .eq("email", userEmail)
      .is("used_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .limit(1)
      .single();
    if (inv?.created_by_user_id) invitedBy = inv.created_by_user_id;
    if (inv?.role === "super_admin" || inv?.role === "pm") inviteRole = inv.role;
  }

  await supabase.from("users").insert({
    email: user.email!,
    name: user.name ?? null,
    image: user.image ?? null,
    role: isSuperAdmin ? "super_admin" : inviteRole,
    status: "active",
    accepted_at: new Date().toISOString(),
    invited_by_user_id: invitedBy ?? null,
    updated_at: new Date().toISOString(),
  });
}

