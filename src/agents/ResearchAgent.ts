import { LinearAgent } from "../lib/LinearAgent";
import OpenAI from "openai"
import { env } from "../lib/env"

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY })

export const researchAgent = new LinearAgent({ webhookSecret: env.LINEAR_WEBHOOK_SECRET, apiUrl: env.API_URL });

researchAgent.on('mention', async (ctx) => {
  const progression = await ctx.showProgress('Researching...')

  const response = await openai.responses.create({
    model: 'gpt-4o-mini',
    instructions: 'You are a software engineering research assistant. Answer the following question to the best of your ability. Search the web if it\'s helpful.',
    input: ctx.content
  });

  await ctx.wait(1000)

  await progression.update("Searching the web for more information...")

  await ctx.wait(1000)

  await progression.done();

  ctx.reply(response.output_text);
})

