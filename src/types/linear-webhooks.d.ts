export type IssueCommentMentionNotification = {
  id: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: null | string;
  type: 'issueCommentMention';
  actorId: string;
  externalUserActorId: null | string;
  userId: string;
  readAt: null | string;
  emailedAt: null | string;
  snoozedUntilAt: null | string;
  unsnoozedAt: null | string;
  issueId: string;
  issue: {
    id: string;
    title: string;
    teamId: string;
    team: unknown;
    identifier: string;
    url: string;
  };
  commentId: string;
  comment: {
    id: string;
    body: string;
    userId: string;
    issueId: string;
  };
  parentCommentId?: string;
  parentComment?: {
    id: string;
    body: string;
    userId: string;
    issueId: string;
  };
  actor: {
    id: string;
    name: string;
    email: string;
    url: string;
  };
};

export type LinearWebhookPayload = {
  type: 'AppUserNotification';
  action: 'issueMention' | 'issueEmojiReaction' | 'issueCommentMention' | 'issueCommentReaction' | 'issueAssignedToYou' | 'issueUnassignedFromYou' | 'issueNewComment' | 'issueStatusChanged';
  createdAt: string;
  organizationId: string;
  oauthClientId: string;
  appUserId: string;
  agentContextId?: string;
  notification: IssueCommentMentionNotification; // This will become a union type as we add more
  webhookTimestamp: number;
  webhookId: string;
};