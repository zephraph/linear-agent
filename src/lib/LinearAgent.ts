import { CommentPayload, Issue, LINEAR_WEBHOOK_SIGNATURE_HEADER, LINEAR_WEBHOOK_TS_FIELD, LinearClient, LinearWebhooks } from "@linear/sdk";
import { getAccessToken } from "./auth";
import { log } from "./logger";
import EventEmitter from "events";
import type { LinearWebhookPayload } from "../types/linear-webhooks";

interface AgentActions {
  showProgress: (message: string) => Promise<AgentProgression>;
  wait: (ms: number) => Promise<void>;
  reply: (message: string) => Promise<CommentPayload>;
}

type LinearMentionContext = AgentActions & {
  content: string;
  entity: { type: 'issue', data: Issue } | { type: 'comment', data: Comment };
};

interface LinearAgentEvents {
  webhook: [payload: LinearWebhookPayload];
  mention: [payload: LinearMentionContext];
}

class AgentProgression {
  constructor(private client: LinearClient, private agentActivityId: string) { }

  public static async start(client: LinearClient, agentContextId: string, message: string) {
    const agentActivity = await client.client.rawRequest(`
      mutation createAgentActivity($input: AgentActivityCreateInput!) {
        agentActivityCreate(input: $input) {
          agentActivity {
            id
          }
        }
      }`,
      {
        input: {
          commentId: agentContextId,
          content: message
        }
      })
    log.debug("AgentProgression.start", { agentActivity: agentActivity.data })
    // @ts-expect-error TODO: Type this properly
    return new AgentProgression(client, agentActivity.data.agentActivityCreate.agentActivity.id);
  }

  public async update(message: string) {
    await this.client.client.rawRequest(`
      mutation updateAgentActivity($id: String!, $input: AgentActivityUpdateInput!) {
        agentActivityUpdate(id: $id, input: $input) {
          agentActivity {
            id
          }
        }
      }
    `, {
      id: this.agentActivityId,
      input: {
        content: message
      }
    })
  }

  public async done() {
    await this.client.client.rawRequest(`
      mutation deleteAgentActivity($id: String!) {
        agentActivityDelete(id: $id) {
          success
        }
      }`,
      {
        id: this.agentActivityId,
      })
  }
}

export class LinearAgent extends EventEmitter<LinearAgentEvents> {
  private webhook: LinearWebhooks;
  private apiUrl?: string;
  private devToken?: string;

  constructor({ webhookSecret, apiUrl, devToken }: { webhookSecret: string, apiUrl?: string, devToken?: string }) {
    super();
    this.webhook = new LinearWebhooks(webhookSecret);
    this.apiUrl = apiUrl;
    this.devToken = devToken;
  }

  //#region Webhook
  private verifyWebhook(body: Buffer, signature: string, timestamp: number) {
    try {
      return this.webhook.verify(body, signature, timestamp);
    } catch (error) {
      log.error(error);
      return false;
    }
  }

  public async handleWebhook(request: Request) {
    const signature = request.headers.get(LINEAR_WEBHOOK_SIGNATURE_HEADER);
    if (!signature) {
      log.debug('LinearAgent.handleWebhook: Missing webhook signature')
      return new Response('Missing webhook signature', { status: 401 });
    }

    if (!request.body) {
      log.debug('LinearAgent.handleWebhook: Missing webhook body')
      return new Response('Missing webhook body', { status: 400 });
    }

    const chunks = [];
    for await (const chunk of request.body) {
      chunks.push(chunk);
    }
    const rawBody = Buffer.concat(chunks);
    const body = JSON.parse(rawBody.toString()) as LinearWebhookPayload;
    const timestamp = body[LINEAR_WEBHOOK_TS_FIELD] as number;

    const token = (await getAccessToken({ accountId: body.appUserId as string })) || this.devToken;

    if (!token) {
      log.debug('LinearAgent.handleWebhook: Unauthorized; missing token')
      return new Response('Unauthorized', { status: 401 });
    }

    if (!this.verifyWebhook(rawBody, signature, timestamp)) {
      log.debug('LinearAgent.handleWebhook: Verify Webhook failed')
      return new Response('Invalid webhook', { status: 401 });
    }

    this.emit('webhook', body);

    if (body.type !== 'AppUserNotification') {
      return new Response('OK', { status: 200 });
    }

    const client = new LinearClient({ apiKey: token, apiUrl: this.apiUrl ? `${this.apiUrl}/graphql` : undefined });

    if (body.action === "issueCommentMention") {
      const { notification, agentContextId } = body;
      if (!agentContextId) return;

      this.emit('mention', {
        content: notification.comment.body,
        showProgress(message: string): Promise<AgentProgression> {
          return AgentProgression.start(client, agentContextId, message);
        },
        wait(ms: number): Promise<void> {
          return new Promise(resolve => setTimeout(resolve, ms));
        },
        reply(message: string) {
          return client.createComment({
            body: message,
            parentId: notification.comment.id,
            issueId: notification.issue.id,
          })
        },
        entity: {
          type: "comment",
          // @ts-expect-error TODO: flesh this out
          data: notification.comment
        }
      })
    }

    return new Response('OK', { status: 200 });
  }
  //#endregion
}

