import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { AuthMfaPurpose } from "@prisma/client";
import { getAuthSecret } from "@/lib/auth-secret";
import {
  findActiveStaffByEmail,
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
      role: string;
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
      },
      async authorize(credentials) {
        if (!process.env.DATABASE_URL) return null;

        try {
          const email = credentials?.email ? String(credentials.email).trim().toLowerCase() : "";
          const password = credentials?.password ? String(credentials.password) : "";

          // Apple demo / App Store review account — password-only sign-in (no MFA).
          if (email && password) {
            const user = await findActiveStaffByEmail(email);
            if (!user?.appleDemoAccount) return null;
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
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.companyId = user.companyId;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.companyId = token.companyId as string;
      session.user.role = token.role as string;
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
