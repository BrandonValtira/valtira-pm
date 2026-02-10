import "next-auth";

declare module "next-auth" {
  interface User {
    id?: string;
    role?: "super_admin" | "pm";
    status?: "invited" | "active";
  }

  interface Session {
    user: {
      id?: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
      role?: "super_admin" | "pm";
      status?: "invited" | "active";
    };
    expires: string;
  }
}
