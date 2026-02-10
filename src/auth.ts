import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppBaseUrl } from "@/lib/app-url";

if (!process.env.NEXTAUTH_URL && process.env.VERCEL_URL) {
  process.env.NEXTAUTH_URL = `https://${process.env.VERCEL_URL}`;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
  ],
  callbacks: {
    async redirect({ url, baseUrl }) {
      const base = baseUrl || getAppBaseUrl();
      if (url.startsWith("/")) return `${base}${url}`;
      try {
        if (new URL(url).origin === base) return url;
      } catch {
        // ignore
      }
      return base;
    },
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
    async session({ session, token }) {
      if (!session.user) return session;
      // Prefer userId stored in JWT at sign-in (most reliable)
      const userId = token.userId as string | undefined;
      const role = token.role as string | undefined;
      const status = token.status as string | undefined;
      if (userId) {
        return {
          ...session,
          user: {
            ...session.user,
            id: userId,
            role: role as "super_admin" | "pm" | undefined,
            status: status as "invited" | "active" | undefined,
          },
        };
      }
      // Fallback: resolve from DB (e.g. old sessions before we set token.userId)
      const supabase = createAdminClient();
      const email = (session.user.email ?? (token.email as string))?.trim().toLowerCase();
      const emailRaw = (session.user.email ?? (token.email as string))?.trim();
      if (!email && !emailRaw) return session;

      let dbUser = await findUserByEmail(supabase, email ?? emailRaw!, emailRaw);
      if (!dbUser) {
        try {
          await upsertUser(supabase, {
            email: session.user.email ?? (token.email as string) ?? undefined,
            name: session.user.name ?? null,
            image: session.user.image ?? null,
          });
          dbUser = await findUserByEmail(supabase, email ?? emailRaw!, emailRaw);
        } catch {
          // ignore
        }
      }
      if (dbUser) {
        return {
          ...session,
          user: {
            ...session.user,
            id: dbUser.id,
            role: dbUser.role as "super_admin" | "pm",
            status: dbUser.status as "invited" | "active",
          },
        };
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user?.email) token.email = user.email;
      // At sign-in: resolve our DB user and persist id/role/status so session has them every time
      if (user?.email) {
        try {
          const supabase = createAdminClient();
          const email = String(user.email).trim().toLowerCase();
          const emailRaw = String(user.email).trim();
          let dbUser = await findUserByEmail(supabase, email, emailRaw);
          if (!dbUser) {
            await upsertUser(supabase, {
              email: user.email,
              name: user.name ?? null,
              image: user.image ?? null,
            });
            dbUser = await findUserByEmail(supabase, email, emailRaw);
          }
          if (dbUser) {
            token.userId = dbUser.id;
            token.role = dbUser.role;
            token.status = dbUser.status;
          }
        } catch {
          // ignore
        }
      }
      return token;
    },
  },
  pages: {
    signIn: "/",
    error: "/auth/error",
  },
});

async function findUserByEmail(
  supabase: ReturnType<typeof createAdminClient>,
  emailLower: string,
  emailRaw: string | undefined
): Promise<{ id: string; role: string; status: string } | null> {
  let { data } = await supabase
    .from("users")
    .select("id, role, status")
    .eq("email", emailLower)
    .single();
  if (!data && emailRaw && emailRaw !== emailLower) {
    const res = await supabase
      .from("users")
      .select("id, role, status")
      .eq("email", emailRaw)
      .single();
    data = res.data;
  }
  return data;
}

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

  const emailLower = user.email?.trim().toLowerCase() ?? "";
  if (!emailLower) return;
  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("email", emailLower)
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
    email: emailLower,
    name: user.name ?? null,
    image: user.image ?? null,
    role: isSuperAdmin ? "super_admin" : inviteRole,
    status: "active",
    accepted_at: new Date().toISOString(),
    invited_by_user_id: invitedBy ?? null,
    updated_at: new Date().toISOString(),
  });
}

