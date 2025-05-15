import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins";
import { LinearClient } from "@linear/sdk";
import { env } from "./env";
import Database from "better-sqlite3";

export const auth = betterAuth({
  basePath: "/auth",
  database: new Database("db.sqlite"),
  trustedOrigins: [
    "https://linear.agent:3000",
    "https://local.linear.dev:8080",
    "https://local.linear.dev:8090",
  ],
  user: {
    additionalFields: {
      metadata: {
        type: "string",
        nullable: true,
      }
    }
  },
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: "linear-agent",
          clientId: env.LINEAR_CLIENT_ID,
          clientSecret: env.LINEAR_CLIENT_SECRET,
          authorizationUrl: `${env.APP_URL}/oauth/authorize`,
          tokenUrl: `${env.API_URL}/oauth/token`,
          redirectURI: "https://linear.agent:3000/auth/oauth2/callback/linear-agent",
          scopes: [
            "comments:create",
            "app:mentionable",
            "write"
          ],
          responseType: "code",
          authorizationUrlParams: {
            actor: "app"
          },
          getUserInfo: async (tokens) => {
            const client = new LinearClient({ accessToken: tokens.accessToken, apiUrl: `${env.API_URL}/graphql` });
            const viewer = await client.viewer;
            return {
              id: viewer.id,
              name: viewer.name,
              email: viewer.email,
              emailVerified: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            }
          },
        }
      ]
    }),
  ],
});

/**
 * BetterAuth currently doesn't expose `getAccessToken` for 
 * 
 * @see https://github.com/better-auth/better-auth/issues/2610
 */
export const getAccessToken = async ({ userId, accountId }: { userId: string, accountId?: undefined } | { userId?: undefined, accountId: string }) => {
  const ctx = await auth.$context;
  const account = userId ? (await ctx.internalAdapter.findAccountByUserId(userId)).at(0) : await ctx.internalAdapter.findAccount(accountId!);
  return account?.accessToken;
};