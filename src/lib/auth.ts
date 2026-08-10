import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { AuthMfaPurpose } from "@prisma/client";
import { getAuthSecret } from "@/lib/auth-secret";
import {
  findActiveStaffByEmail,
  findActiveStaffById,
  verifyStaffMfaChallenge,
  verifyStaffPassword,
} from "@/lib/staff-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      companyId: string;
      /** Effective role (preview role when role preview is active). */
      role: string;
      /** Real DB role while previewing; omitted when not previewing. */
      trueRole?: string;
    };
  }

  interface User {
    companyId: string;
    role: string;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    companyId: string;
    role: string;
    trueRole?: string;
  }
}

const authSecret = getAuthSecret();

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        challengeId: { label: "Challenge", type: "text" },
        code: { label: "Code", type: "text" },
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
        companyId: { label: "Company", type: "text" },
        userId: { label: "User", type: "text" },
      },
      async authorize(credentials) {
        if (!process.env.DATABASE_URL) return null;

        try {
          const email = credentials?.email ? String(credentials.email).trim().toLowerCase() : "";
          const password = credentials?.password ? String(credentials.password) : "";
          const companyId = credentials?.companyId
            ? String(credentials.companyId)
            : "";
          const userId = credentials?.userId ? String(credentials.userId) : "";

          // Apple demo / App Store review account — password-only sign-in (no MFA).
          if (email && password) {
            const user = userId
              ? await findActiveStaffById(userId)
              : await findActiveStaffByEmail(email, companyId || null);
            if (!user?.appleDemoAccount) return null;
            if (email && user.email.toLowerCase() !== email) return null;
            if (!(await verifyStaffPassword(user, password))) return null;
            return {
              id: user.id,
              email: user.email,
              name: user.name,
              companyId: user.companyId,
              role: user.role,
            };
          }

          const challengeId = credentials?.challengeId
            ? String(credentials.challengeId)
            : "";
          const code = credentials?.code ? String(credentials.code) : "";
          if (!challengeId || !code) return null;

          const result = await verifyStaffMfaChallenge(
            challengeId,
            code,
            AuthMfaPurpose.LOGIN,
          );
          if (!result.ok) return null;

          return {
            id: result.user.id,
            email: result.user.email,
            name: result.user.name,
            companyId: result.user.companyId,
            role: result.user.role,
          };
        } catch {
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id!;
        token.companyId = user.companyId;
        token.role = user.role;
        delete token.trueRole;
        if (user.email) token.email = user.email;
        if (user.name) token.name = user.name;
      }
      if (trigger === "update" && session?.user) {
        const next = session.user as {
          id?: string;
          companyId?: string;
          role?: string;
          email?: string;
          name?: string;
          trueRole?: string | null;
        };
        const switchingUser = Boolean(next.id && next.id !== token.id);
        if (next.id) token.id = next.id;
        if (next.companyId) token.companyId = next.companyId;
        if (next.role) token.role = next.role;
        if (next.email) token.email = next.email;
        if (next.name) token.name = next.name;
        if (switchingUser) {
          delete token.trueRole;
        } else if ("trueRole" in next) {
          if (next.trueRole) token.trueRole = next.trueRole;
          else delete token.trueRole;
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.companyId = token.companyId as string;
      session.user.role = token.role as string;
      if (token.trueRole) session.user.trueRole = token.trueRole;
      else delete session.user.trueRole;
      if (token.email) session.user.email = token.email as string;
      if (token.name) session.user.name = token.name as string;
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  secret: authSecret,
  trustHost: true,
});
