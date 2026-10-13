import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { createClient } from "@supabase/supabase-js";
import { BAPTISTA_SCHEMA } from "@/lib/supabase/schema";

declare module "next-auth" {
  interface User {
    userId: string;
  }
  interface Session {
    user: { userId: string; email: string };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    userId: string;
    email: string;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(credentials) {
        const email =
          typeof credentials.email === "string"
            ? credentials.email.trim().toLowerCase()
            : "";
        if (!email) return null;

        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SECRET_KEY!,
          { db: { schema: BAPTISTA_SCHEMA } },
        );

        const { data: user } = await supabase
          .from("users")
          .select("id, email")
          .eq("email", email)
          .maybeSingle();

        if (!user) return null;
        return { id: user.id, userId: user.id, email: user.email };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/accedi" },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.userId = (user as { userId: string }).userId;
        token.email = user.email!;
      }
      return token;
    },
    session({ session, token }) {
      session.user.userId = token.userId;
      session.user.email = token.email;
      return session;
    },
  },
});
