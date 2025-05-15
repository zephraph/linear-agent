import type { MiddlewareHandler, Context, Next } from "hono"
import pino from "pino"
import { env } from "./env";

export const log = pino({ level: env.LOG_LEVEL, base: undefined });

export function logger(): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const { method } = c.req
    const requestId = c.get("requestId").slice(0, 8)

    log.info(`${requestId} --> [${method}] ${c.req.path}`)

    const start = Date.now()
    await next()

    log.info(
      `${requestId} ${c.res.status} [${method}] ${c.req.path} ${c.res.statusText}`,
    )
  }
}