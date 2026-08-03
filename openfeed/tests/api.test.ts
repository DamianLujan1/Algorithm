import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../src/server/app.js";
import { SessionStore } from "../src/server/session-store.js";

const stores: SessionStore[] = [];

function testApp() {
  const store = new SessionStore();
  stores.push(store);
  return createApp({ store, isProduction: false });
}

afterEach(() => {
  stores.forEach((store) => store.clear());
  stores.length = 0;
});

describe("Openfeed API", () => {
  it("exposes health and algorithm provenance without a session", async () => {
    const app = testApp();

    const health = await request(app).get("/api/health").expect(200);
    expect(health.body).toMatchObject({
      status: "ok",
      service: "openfeed",
      algorithm: "CombinedScoreAndTruncateTransform",
    });

    const algorithm = await request(app).get("/api/algorithm").expect(200);
    expect(algorithm.body.sourceUnmodified).toBe(true);
    expect(algorithm.body.constants.realGraphWeight).toBe(1);
    expect(algorithm.body.sourcePath).toContain("CombinedScoreAndTruncateTransform.scala");
  });

  it("requires a guest session for personalized feed routes", async () => {
    const response = await request(testApp()).get("/api/feed").expect(401);
    expect(response.body.error.code).toBe("SESSION_REQUIRED");
  });

  it("validates guest profile input", async () => {
    const app = testApp();

    await request(app)
      .post("/api/session")
      .send({ displayName: "A", interests: ["ai"] })
      .expect(400);
    await request(app)
      .post("/api/session")
      .send({ displayName: "Ada", interests: ["unknown"] })
      .expect(400);
    await request(app)
      .post("/api/session")
      .send({ displayName: "Ada", interests: [] })
      .expect(400);
  });

  it("creates a passwordless session and returns a ranked feed", async () => {
    const agent = request.agent(testApp());
    const session = await agent
      .post("/api/session")
      .send({ displayName: "  Ada   Lovelace ", interests: ["ai", "engineering"] })
      .expect(201);

    expect(session.body.user.displayName).toBe("Ada Lovelace");
    expect(session.headers["set-cookie"][0]).toContain("HttpOnly");
    expect(session.headers["set-cookie"][0]).toContain("SameSite=Lax");

    const feed = await agent.get("/api/feed?multiplier=1.65").expect(200);
    expect(feed.body.user.displayName).toBe("Ada Lovelace");
    expect(feed.body.settings.earlybirdMultiplier).toBe(1.65);
    expect(feed.body.posts.length).toBeGreaterThan(0);
    expect(feed.body.posts.at(-1).isExploration).toBe(true);
    expect(feed.body.algorithm.sourceUnmodified).toBe(true);
    expect(feed.body.posts[0].scores.combined).toBeTypeOf("number");
  });

  it("rejects multipliers outside the original parameter bounds", async () => {
    const agent = request.agent(testApp());
    await agent
      .post("/api/session")
      .send({ displayName: "Grace", interests: ["science"] })
      .expect(201);

    const response = await agent.get("/api/feed?multiplier=20.1").expect(400);
    expect(response.body.error.code).toBe("INVALID_MULTIPLIER");
  });

  it("applies interactions to local signals and supports undoing hidden posts", async () => {
    const agent = request.agent(testApp());
    await agent
      .post("/api/session")
      .send({ displayName: "Lin", interests: ["design"] })
      .expect(201);

    const initialFeed = await agent.get("/api/feed").expect(200);
    const target = initialFeed.body.posts.find(
      (post: { isExploration: boolean }) => !post.isExploration,
    );
    const initialSignal = initialFeed.body.topicSignals.find(
      (signal: { topic: string }) => signal.topic === target.topic,
    ).value;

    await agent
      .post("/api/interactions")
      .send({ postId: target.id, action: "like", active: true })
      .expect(200);
    const likedFeed = await agent.get("/api/feed").expect(200);
    expect(
      likedFeed.body.topicSignals.find(
        (signal: { topic: string }) => signal.topic === target.topic,
      ).value,
    ).toBeGreaterThan(initialSignal);

    await agent
      .post("/api/interactions")
      .send({ postId: target.id, action: "not_interested", active: true })
      .expect(200);
    const hiddenFeed = await agent.get("/api/feed").expect(200);
    expect(hiddenFeed.body.posts.some((post: { id: string }) => post.id === target.id)).toBe(false);

    await agent
      .post("/api/interactions")
      .send({ postId: target.id, action: "not_interested", active: false })
      .expect(200);
    const restoredFeed = await agent.get("/api/feed").expect(200);
    expect(restoredFeed.body.candidateCount).toBe(initialFeed.body.candidateCount);
  });

  it("clears the guest session", async () => {
    const agent = request.agent(testApp());
    await agent
      .post("/api/session")
      .send({ displayName: "Katherine", interests: ["science"] })
      .expect(201);
    await agent.delete("/api/session").expect(204);
    const session = await agent.get("/api/session").expect(200);
    expect(session.body.user).toBeNull();
  });
});
