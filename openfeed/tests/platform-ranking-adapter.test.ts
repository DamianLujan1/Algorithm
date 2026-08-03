import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  PLATFORM_ADAPTER_NAME,
  rankPlatformCandidates,
  TIMELINE_RANKER_SOURCE_PATH,
  TIMELINE_RANKER_SOURCE_SHA256,
} from "../src/server/platform-ranking-adapter.js";

interface PlatformCandidate {
  id: string;
  earlybirdScore?: number;
  isRandomTweet?: boolean;
  platformLabel: string;
}

describe("Openfeed CandidateEnvelope transformation", () => {
  it("maps platform objects through TimelineRanker and back without changing their shape", () => {
    const candidates: PlatformCandidate[] = [
      { id: "relationship", earlybirdScore: 0.2, platformLabel: "Relationship winner" },
      { id: "content", earlybirdScore: 0.9, platformLabel: "Content winner" },
      { id: "reply", earlybirdScore: 0.4, platformLabel: "Reply below cutoff" },
      {
        id: "explore",
        earlybirdScore: 99,
        isRandomTweet: true,
        platformLabel: "Reserved exploration",
      },
    ];
    const snapshot = structuredClone(candidates);

    const result = rankPlatformCandidates({
      candidates,
      realGraphScores: new Map([
        ["relationship", 0.9],
        ["content", 0.1],
        ["reply", 0.2],
        ["explore", 99],
      ]),
      replyCandidateIds: new Set(["reply"]),
      config: {
        maxCount: 2,
        earlybirdScoreMultiplier: 1,
        numAdditionalReplies: 1,
      },
      surface: "feed",
    });

    expect(result.delivered.map(({ candidate }) => candidate.id)).toEqual([
      "relationship",
      "reply",
      "explore",
    ]);
    expect(result.delivered.map(({ placement }) => placement)).toEqual([
      "ranked",
      "additional_reply",
      "exploration",
    ]);
    expect(result.delivered[0]?.candidate.platformLabel).toBe("Relationship winner");
    expect(result.envelope).toEqual({
      searchResultCount: 4,
      utegResultCount: 4,
      replyCandidateCount: 1,
    });
    expect(result.provenance).toMatchObject({
      algorithm: "CombinedScoreAndTruncateTransform",
      adapter: PLATFORM_ADAPTER_NAME,
      sourcePath: TIMELINE_RANKER_SOURCE_PATH,
      sourceSha256: TIMELINE_RANKER_SOURCE_SHA256,
      sourceUnmodified: true,
      surface: "feed",
    });
    expect(candidates).toEqual(snapshot);
  });

  it("rejects inputs that violate production CandidateEnvelope assumptions", () => {
    const baseRequest = {
      realGraphScores: new Map([["one", 0.4]]),
      config: {
        maxCount: 1,
        earlybirdScoreMultiplier: 1,
        numAdditionalReplies: 0,
      },
      surface: "assistant" as const,
    };

    expect(() =>
      rankPlatformCandidates({
        ...baseRequest,
        candidates: [
          { id: "one", platformLabel: "First" },
          { id: "one", platformLabel: "Duplicate" },
        ],
      }),
    ).toThrow(/unique candidate ids/);

    expect(() =>
      rankPlatformCandidates({
        ...baseRequest,
        candidates: [{ id: "one", platformLabel: "First" }],
        realGraphScores: new Map([["unknown", 0.4]]),
      }),
    ).toThrow(/unknown candidate/);

    expect(() =>
      rankPlatformCandidates({
        ...baseRequest,
        candidates: [{ id: "one", platformLabel: "First" }],
        config: { ...baseRequest.config, earlybirdScoreMultiplier: 20.1 },
      }),
    ).toThrow(/source bound/);
  });
});

describe("unchanged Scala algorithm source", () => {
  it("matches the source reviewed by the platform adapter", () => {
    const sourceFile = path.resolve(process.cwd(), "..", TIMELINE_RANKER_SOURCE_PATH);
    const source = readFileSync(sourceFile, "utf8");
    const digest = createHash("sha256").update(source).digest("hex");

    expect(digest).toBe(TIMELINE_RANKER_SOURCE_SHA256);
    expect(source).toContain("val DefaultRealGraphWeight = 1.0");
    expect(source).toContain("val DefaultEmptyScore = 0.0");
    expect(source).toContain("searchResultsAndScore.partition");
    expect(source).toContain(".sortBy(_._2)(Ordering[Double].reverse).map(_._1).splitAt(");
    expect(source).toContain("topResults ++ additionalReplies ++ randomSearchResults");
  });
});
