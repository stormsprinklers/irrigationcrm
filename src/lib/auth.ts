import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { AuthMfaPurpose } from "@prisma/client";
import { getAuthSecret } from "@/lib/auth-secret";
import { prisma } from "@/lib/prisma";
import {
  findActiveStaffByEmail,
  findActiveStaffById,
  verifyStaffMfaChallenge,
  verifyStaffPassword,
} from "@/lib/staff-auth";
import { parseAuthSessionAction } from "@/lib/auth-session-action";
import { writeSecurityAuditEvent } from "@/lib/security/audit";
import { consumeAffiliateSignInToken } from "@/lib/affiliate/sign-in";

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
    mobileWebExpiresAt?: number;
    authVersion?: number;
  }
}

const authSecret = getAuthSecret();
const AUTH_VERSION = 2;

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
        affiliateToken: { label: "Affiliate sign-in token", type: "text" },
      },
      async authorize(credentials) {
        if (!process.env.DATABASE_URL) return null;

        try {
          const affiliateToken = credentials?.affiliateToken
            ? String(credentials.affiliateToken)
            : "";
          if (affiliateToken) {
            const user = await consumeAffiliateSignInToken(affiliateToken);
            if (!user) return null;
            return {
              id: user.id,
              email: user.email,
              name: user.name,
              companyId: user.companyId,
              role: user.role,
            };
          }

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
      // Native web screens get a short-lived session. Recheck the real account
      // on every use, and do not allow session.update to change its identity/role.
      if (token.mobileWebExpiresAt !== undefined) {
        if (token.mobileWebExpiresAt <= Math.floor(Date.now() / 1000)) return null;
        const account = await prisma.user.findUnique({
          where: { id: token.id },
          select: { status: true, companyId: true, role: true },
        });
        if (!account || account.status !== "ACTIVE" ||
            account.companyId !== token.companyId || account.role !== token.role) return null;
        return token;
      }
      if (user) {
        token.id = user.id!;
        token.companyId = user.companyId;
        token.role = user.role;
        token.authVersion = AUTH_VERSION;
        delete token.trueRole;
        if (user.email) token.email = user.email;
        if (user.name) token.name = user.name;
      }
      // Invalidate JWTs created before server-authorized session transitions were
      // introduced. This intentionally signs existing staff out once on rollout.
      if (!user && token.authVersion !== AUTH_VERSION) return null;

      if (trigger === "update") {
        const requested = parseAuthSessionAction(
          (session as { securityAction?: unknown } | undefined)?.securityAction
        );

        const current = await prisma.user.findFirst({
          where: {
            id: token.id,
            companyId: token.companyId,
            status: "ACTIVE",
            systemKind: null,
          },
          select: { id: true, email: true, name: true, companyId: true, role: true, appleDemoAccount: true },
        });
        if (!current) return null;

        if (requested?.type === "switch-account") {
          const target = await prisma.user.findFirst({
            where: {
              id: requested.targetUserId,
              status: "ACTIVE",
              systemKind: null,
            },
            select: { id: true, email: true, name: true, companyId: true, role: true, appleDemoAccount: true },
          });
          if (target && !current.appleDemoAccount && !target.appleDemoAccount && target.id !== current.id) {
            const sameEmail = target.email.toLowerCase() === current.email.toLowerCase();
            const link = sameEmail
              ? true
              : Boolean(
                  await prisma.userAccountLink.findFirst({
                    where: {
                      OR: [
                        { userId: current.id, linkedUserId: target.id },
                        { userId: target.id, linkedUserId: current.id },
                      ],
                    },
                    select: { id: true },
                  })
                );
            if (sameEmail || link) {
              await writeSecurityAuditEvent({
                event: "SESSION_ACCOUNT_SWITCH",
                outcome: "SUCCESS",
                companyId: current.companyId,
                actorId: current.id,
                resourceType: "User",
                resourceId: target.id,
                metadata: { targetCompanyId: target.companyId },
              });
              token.id = target.id;
              token.companyId = target.companyId;
              token.role = target.role;
              token.email = target.email;
              token.name = target.name;
              delete token.trueRole;
              return token;
            }
          }
          await writeSecurityAuditEvent({
            event: "SESSION_ACCOUNT_SWITCH",
            outcome: "DENIED",
            companyId: current.companyId,
            actorId: current.id,
            resourceType: "User",
            resourceId: requested.targetUserId,
          });
        }

        if (requested?.type === "role-preview" && current.role === "ADMIN") {
          await writeSecurityAuditEvent({
            event: "SESSION_ROLE_PREVIEW",
            outcome: "SUCCESS",
            companyId: current.companyId,
            actorId: current.id,
            resourceType: "Role",
            resourceId: requested.role ?? "ADMIN",
          });
          if (requested.role) {
            token.role = requested.role;
            token.trueRole = "ADMIN";
          } else {
            token.role = "ADMIN";
            delete token.trueRole;
          }
          token.email = current.email;
          token.name = current.name;
          return token;
        }

        // Ordinary session refreshes can update presentation fields only from
        // the database. Preserve a valid admin preview but never trust client claims.
        const previewing = token.trueRole === "ADMIN" && current.role === "ADMIN";
        token.email = current.email;
        token.name = current.name;
        token.companyId = current.companyId;
        if (!previewing) {
          token.role = current.role;
          delete token.trueRole;
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
