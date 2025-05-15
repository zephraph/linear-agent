import { Hono } from 'hono'
import { logger } from './lib/logger'
import { auth } from './lib/auth'
import { requestId } from 'hono/request-id'
import { researchAgent } from './agents/ResearchAgent'

const app = new Hono()

app.use('*', requestId())
app.use(logger())

app.get('/', async (c) => {
  return c.html(
    <html>
      <head>
        <title>Linear Agent</title>
        <script src="https://unpkg.com/htmx.org@2.0.4" integrity="sha384-HGfztofotfshcF7+8n44JQL2oJmowVChPTg48S+jvZoztPfvwD79OC/LTtG6dMp+" crossorigin="anonymous"></script>
      </head>
      <body>
        <h1>Linear Agent</h1>
        <p>This agent will respond to @mentions in Linear comments using AI.</p>
        <button hx-post="/install"> Install in Linear</button>
        <pre id="auth-status"></pre>
      </body>
    </html>
  )
})

app.post("/install", async (c) => {
  const res = await auth.api.signInWithOAuth2({
    body: {
      providerId: "linear-agent",
      callbackURL: "https://linear.agent:3000",
    }
  })
  return new Response("ok", { status: 200, headers: res.redirect ? { "HX-Redirect": res.url } : undefined })  
})

app.all("/auth/*", (c) => auth.handler(c.req.raw))

app.post('/webhook', c => researchAgent.handleWebhook(c.req.raw))

export default app;