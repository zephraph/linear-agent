import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  DEBUG: z.coerce.boolean().default(false),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),

  APP_URL: z.string().url().default("https://local.linear.dev:8080"),
  API_URL: z.string().url().default("https://local.linear.dev:8090"),

  // OpenAI configuration
  OPENAI_API_KEY: z.string().min(1),

  DEV_TOKEN: z.string().optional(),

  // Linear configuration
  LINEAR_WEBHOOK_SECRET: z.string().startsWith("lin_wh_").min(1),
  LINEAR_CLIENT_ID: z.string().min(1),
  LINEAR_CLIENT_SECRET: z.string().min(1),

  // Auth configuration
  BETTER_AUTH_SECRET: z.string().min(1)
});

export const env = envSchema.parse(process.env);

export type EnvVars = z.infer<typeof envSchema>; 