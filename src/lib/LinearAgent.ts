import { CommentPayload, Issue, LINEAR_WEBHOOK_SIGNATURE_HEADER, LINEAR_WEBHOOK_TS_FIELD, LinearClient, LinearWebhooks } from "@linear/sdk";
import { getAccessToken } from "./auth";
import { log } from "./logger";
import EventEmitter from "events";
import type { LinearWebhookPayload } from "../types/linear-webhooks";
import z from "zod";

interface AgentActions {
  startAction: (action: ActionLogActivity) => Promise<AgentActionProgress>;
  action: (action: ActionLogActivity) => Promise<void>;
  wait: (ms: number) => Promise<void>;
  reply: (message: string) => Promise<CommentPayload | null>;
}

type LinearMentionContext = AgentActions & {
  content: string;
  entity: { type: 'issue', data: Issue } | { type: 'comment', data: Comment };
};

interface LinearAgentEvents {
  webhook: [payload: LinearWebhookPayload];
  mention: [payload: LinearMentionContext];
}

//#region Activity CRUD
async function createActivity(client: LinearClient, contextId: string, activity: ActionLogActivity) {
  try {
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
          contextId,
          body: {
            type: AgentActivityType.ACTION_LOG,
            ...activity
          } satisfies AgentActivityBody
        }
      })
    log.debug({ contextId, agentActivity: agentActivity.data }, 'LinearAgent.createActivity')
    // @ts-expect-error TODO: Type this properly
    return agentActivity.data?.agentActivityCreate?.agentActivity?.id;
  } catch (error) {
    log.error({ error: error, contextId, activity: activity.message }, 'Failed to create activity')
    return null;
  }
}

async function updateActivity(client: LinearClient, activityId: string, activity: ActionLogActivity) {
  try {
    const agentActivity = await client.client.rawRequest(`
      mutation updateAgentActivity($id: String!, $input: AgentActivityUpdateInput!) {
        agentActivityUpdate(id: $id, input: $input) {
          agentActivity {
            id
          }
        }
      }
    `, {
      id: activityId,
      input: {
        body: {
          type: AgentActivityType.ACTION_LOG,
          ...activity
        } satisfies AgentActivityBody
      }
    })

    log.debug({ activityId, agentActivity: agentActivity.data }, 'LinearAgent.updateActivity')
  } catch (error) {
    log.error({ error, activityId, activity }, 'Failed to update activity')
  }
}

async function deleteActivity(client: LinearClient, activityId: string) {
  try {
    await client.client.rawRequest(`
      mutation deleteAgentActivity($id: String!) {
        agentActivityDelete(id: $id) {
          success
        }
      }`,
      {
        id: activityId,
      })
  } catch (error) {
    log.error({ error, activityId }, 'Failed to delete activity')
  }
}
//#endregion

//#region Agent Progress
class AgentActionProgress {
  constructor(private client: LinearClient, private agentActivityId: string | null) { }

  public static async start(client: LinearClient, agentContextId: string, action: ActionLogActivity) {
    const agentActivity = await createActivity(client, agentContextId, action);
    return new AgentActionProgress(client, agentActivity);
  }

  public update(action: ActionLogActivity) {
    if (!this.agentActivityId) {
      log.error('LinearAgent.AgentActionProgress: Failed to update action progress; no agent activity ID');
      return;
    }
    return updateActivity(this.client, this.agentActivityId, action);
  }

  public done() {
    if (!this.agentActivityId) {
      log.error('LinearAgent.AgentActionProgress: Failed to delete action progress; no agent activity ID');
      return;
    }
    return deleteActivity(this.client, this.agentActivityId);
  }
}
//#endregion

//#region Linear Agent
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

  private static async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

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

    log.debug({ body }, 'LinearAgent.handleWebhook: AppUserNotification')

    const client = new LinearClient({ apiKey: token, apiUrl: this.apiUrl ? `${this.apiUrl}/graphql` : undefined });

    if (body.action === "issueCommentMention") {
      const { notification, agentContextId } = body;
      if (!agentContextId) return;

      this.emit('mention', {
        content: notification.comment.body,
        startAction(activity: ActionLogActivity): Promise<AgentActionProgress> {
          return AgentActionProgress.start(client, agentContextId, { ...activity, inProgress: true });
        },
        async action(activity: ActionLogActivity): Promise<void> {
          const agentActivity = await createActivity(client, agentContextId, activity);
          return agentActivity;
        },
        wait(ms: number): Promise<void> {
          return LinearAgent.wait(ms);
        },
        async reply(message: string) {
          try {
            return await client.createComment({
              body: message,
              parentId: notification.parentCommentId ?? notification.comment.id,
              issueId: notification.issue.id,
            })
          } catch (error) {
            log.error({ error, message, comment: notification.comment }, 'Failed to create comment')
            return null;
          }
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
}
//#endregion

// #region Schema
// Schemas: This should be imported from the SDK

export enum AgentActivityType {
  ACTION_LOG = "action_log",
}

/**
 * Defines the display mode for agent activities that have an icon and descriptive text.
 */
export enum AgentActivityDisplayMode {
  ACT = "act",
  SEARCH = "search",
  EDIT = "edit",
  ERROR = "error",
  CANCEL = "cancel",
}

/**
 * Zod schema for an agent activity log entry.
 */
const actionLogActivityBodySchema = z.object({
  type: z.literal(AgentActivityType.ACTION_LOG),
  mode: z.enum(Object.values(AgentActivityDisplayMode) as [string, ...string[]]),
  message: z.string(),
  target: z.string().optional(),
  inProgress: z.boolean().optional(),
});

export type ActionLogActivity = Omit<z.infer<typeof actionLogActivityBodySchema>, 'type'>;

export const agentActivityBodySchema = z.discriminatedUnion("type", [
  actionLogActivityBodySchema,
]);


export type AgentActivityBody = z.infer<typeof agentActivityBodySchema>;
// #endregion
