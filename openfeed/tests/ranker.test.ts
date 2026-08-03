import { describe, expect, it } from "vitest";

import {
  combinedScore,
  combinedScoreAndTruncate,
  combinedScoreAndTruncateWithTrace,
} from "../src/server/ranker.js";

interface Candidate {
  id: string;
  earlybirdScore?: number;
  isRandomTweet?: boolean;
}

describe("CombinedScoreAndTruncate compatibility adapter", () => {
  it("uses the source constants and defaults missing scores to zero", () => {
    expect(combinedScore(0.35, 0.8, 1.5)).toBeCloseTo(1.55);
    expect(combinedScore(undefined, undefined, 20)).toBe(0);
    expect(combinedScore(0.4, undefined, 2)).toBe(0.4);
  });

  it("sorts, truncates, adds a reply, and appends random candidates in source order", () => {
    const candidates: Candidate[] = [
      { id: "a", earlybirdScore: 0.5 },
      { id: "b", earlybirdScore: 0.2 },
      { id: "c", earlybirdScore: 0.4 },
      { id: "random", earlybirdScore: 10, isRandomTweet: true },
      { id: "e", earlybirdScore: 0.5 },
    ];
    const snapshot = structuredClone(candidates);

    const trace = combinedScoreAndTruncateWithTrace(
      {
        searchResults: candidates,
        utegResults: new Map([
          ["a", 0.4],
          ["b", 0.8],
          ["c", 0.3],
          ["random", 10],
          ["e", 0.1],
        ]),
        replyTweetIds: new Set(["c", "e"]),
      },
      {
        maxCount: 3,
        earlybirdScoreMultiplier: 1,
        numAdditionalReplies: 1,
      },
    );

    expect(trace.results.map(({ id }) => id)).toEqual(["b", "a", "c", "random"]);
    expect(trace.topResultIds).toEqual(new Set(["b", "a"]));
    expect(trace.additionalReplyIds).toEqual(new Set(["c"]));
    expect(trace.randomResultIds).toEqual(new Set(["random"]));
    expect(candidates).toEqual(snapshot);
  });

  it("matches Scala splitAt behavior when random results exceed the max count", () => {
    const results = combinedScoreAndTruncate(
      {
        searchResults: [
          { id: "reply", earlybirdScore: 0.6 },
          { id: "random-1", isRandomTweet: true },
          { id: "random-2", isRandomTweet: true },
        ],
        utegResults: new Map(),
        replyTweetIds: new Set(["reply"]),
      },
      {
        maxCount: 1,
        earlybirdScoreMultiplier: 1,
        numAdditionalReplies: 1,
      },
    );

    expect(results.map(({ id }) => id)).toEqual(["reply", "random-1", "random-2"]);
  });

  it("does not inject replies when the configured count is zero", () => {
    const results = combinedScoreAndTruncate(
      {
        searchResults: [
          { id: "first", earlybirdScore: 0.9 },
          { id: "reply", earlybirdScore: 0.8 },
        ],
        utegResults: new Map(),
        replyTweetIds: new Set(["reply"]),
      },
      {
        maxCount: 1,
        earlybirdScoreMultiplier: 1,
        numAdditionalReplies: 0,
      },
    );

    expect(results.map(({ id }) => id)).toEqual(["first"]);
  });
});
