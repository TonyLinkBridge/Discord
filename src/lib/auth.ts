import "server-only";

import { getServerSession, type NextAuthOptions } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";
import { resolveAdminAuthEnvironment } from "@/features/auth/access-policy";

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET?.trim(),
  session: { strategy: "jwt" },
  providers: [
    DiscordProvider({
      clientId: process.env.AUTH_DISCORD_ID?.trim() ?? "",
      clientSecret: process.env.AUTH_DISCORD_SECRET?.trim() ?? "",
    }),
  ],
  pages: {
    signIn: "/sign-in",
    error: "/access-denied",
  },
  callbacks: {
    jwt({ token, account, profile }) {
      if (
        account?.provider === "discord" &&
        profile &&
        "id" in profile &&
        typeof profile.id === "string"
      ) {
        token.discordUserId = profile.id;
      }

      return token;
    },
    session({ session, token }) {
      return {
        ...session,
        user: {
          ...session.user,
          discordUserId:
            typeof token.discordUserId === "string" ? token.discordUserId : undefined,
        },
      };
    },
  },
};

export function getAdminAuthEnvironment() {
  return resolveAdminAuthEnvironment({
    NODE_ENV: process.env.NODE_ENV,
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_DISCORD_ID: process.env.AUTH_DISCORD_ID,
    AUTH_DISCORD_SECRET: process.env.AUTH_DISCORD_SECRET,
    ADMIN_DISCORD_USER_IDS: process.env.ADMIN_DISCORD_USER_IDS,
    DEV_OPERATOR_ID: process.env.DEV_OPERATOR_ID,
  });
}

export async function getAuthenticatedDiscordUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const user = session?.user as { discordUserId?: unknown } | undefined;

  return typeof user?.discordUserId === "string" ? user.discordUserId.trim() || null : null;
}
