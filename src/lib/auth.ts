import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

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

const authSecret =
  process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET ?? "dev-only-secret-change-me";

// TODO: Remove before production — temporary dev login while auth/DB are being set up
const TEMP_DEV_ADMIN = {
  email: "admin@stormsprinklers.com",
  password: "Test123",
  name: "Dev Admin",
  companyId: "seed-company",
  id: "dev-admin",
};

function getDevAdminSession() {
  return {
    id: TEMP_DEV_ADMIN.id,
    email: TEMP_DEV_ADMIN.email,
    name: TEMP_DEV_ADMIN.name,
    companyId: TEMP_DEV_ADMIN.companyId,
    role: "ADMIN",
  };
}

async function tryEnsureDevAdminInDb() {
  if (!process.env.DATABASE_URL) return;

  try {
    const passwordHash = await bcrypt.hash(TEMP_DEV_ADMIN.password, 10);
    await prisma.company.upsert({
      where: { id: TEMP_DEV_ADMIN.companyId },
      update: {},
      create: {
        id: TEMP_DEV_ADMIN.companyId,
        name: "Storm Sprinklers",
      },
    });
    await prisma.user.upsert({
      where: { email: TEMP_DEV_ADMIN.email },
      update: { passwordHash, role: "ADMIN", status: "ACTIVE" },
      create: {
        email: TEMP_DEV_ADMIN.email,
        name: TEMP_DEV_ADMIN.name,
        passwordHash,
        role: "ADMIN",
        companyId: TEMP_DEV_ADMIN.companyId,
        color: "#2563EB",
      },
    });
  } catch {
    // DB not ready yet — dev login still works without it
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = String(credentials.email).toLowerCase().trim();
        const password = String(credentials.password);

        if (email === TEMP_DEV_ADMIN.email && password === TEMP_DEV_ADMIN.password) {
          void tryEnsureDevAdminInDb();
          return getDevAdminSession();
        }

        if (!process.env.DATABASE_URL) return null;

        try {
          const user = await prisma.user.findUnique({
            where: { email },
          });

          if (!user?.passwordHash) return null;

          const valid = await bcrypt.compare(password, user.passwordHash);
          if (!valid) return null;

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            companyId: user.companyId,
            role: user.role,
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
