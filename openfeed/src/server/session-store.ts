import { randomUUID } from "node:crypto";

import { TOPIC_OPTIONS, type CandidatePost, type InteractionAction, type SessionUser, type Topic } from "../shared/types.js";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const SIGNAL_DELTA: Record<InteractionAction, number> = {
  like: 0.08,
  save: 0.04,
  not_interested: -0.14,
};

export interface SessionRecord {
  sessionId: string;
  user: SessionUser;
  affinities: Record<Topic, number>;
  likedPostIds: Set<string>;
  savedPostIds: Set<string>;
  hiddenPostIds: Set<string>;
  lastSeenAt: number;
}

export class SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();

  create(displayName: string, interests: Topic[]): SessionRecord {
    this.removeExpired();

    const now = new Date();
    const affinities = Object.fromEntries(
      TOPIC_OPTIONS.map(({ id }) => [id, interests.includes(id) ? 0.72 : 0.18]),
    ) as Record<Topic, number>;

    const record: SessionRecord = {
      sessionId: randomUUID(),
      user: {
        id: randomUUID(),
        displayName,
        interests,
        createdAt: now.toISOString(),
      },
      affinities,
      likedPostIds: new Set(),
      savedPostIds: new Set(),
      hiddenPostIds: new Set(),
      lastSeenAt: now.getTime(),
    };

    this.sessions.set(record.sessionId, record);
    return record;
  }

  get(sessionId: string | undefined): SessionRecord | undefined {
    if (!sessionId) {
      return undefined;
    }

    const record = this.sessions.get(sessionId);
    if (!record) {
      return undefined;
    }

    if (Date.now() - record.lastSeenAt > SESSION_TTL_MS) {
      this.sessions.delete(sessionId);
      return undefined;
    }

    record.lastSeenAt = Date.now();
    return record;
  }

  delete(sessionId: string | undefined): void {
    if (sessionId) {
      this.sessions.delete(sessionId);
    }
  }

  setInteraction(
    session: SessionRecord,
    post: CandidatePost,
    action: InteractionAction,
    active: boolean,
  ): void {
    const targetSet =
      action === "like"
        ? session.likedPostIds
        : action === "save"
          ? session.savedPostIds
          : session.hiddenPostIds;
    const wasActive = targetSet.has(post.id);

    if (wasActive === active) {
      return;
    }

    if (active) {
      targetSet.add(post.id);
    } else {
      targetSet.delete(post.id);
    }

    const direction = active ? 1 : -1;
    const nextAffinity = session.affinities[post.topic] + SIGNAL_DELTA[action] * direction;
    session.affinities[post.topic] = Math.max(0, Math.min(1, nextAffinity));
  }

  clear(): void {
    this.sessions.clear();
  }

  private removeExpired(): void {
    const cutoff = Date.now() - SESSION_TTL_MS;
    for (const [sessionId, record] of this.sessions) {
      if (record.lastSeenAt < cutoff) {
        this.sessions.delete(sessionId);
      }
    }
  }
}
