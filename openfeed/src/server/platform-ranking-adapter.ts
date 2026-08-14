import {
  combinedScoreAndTruncateWithTrace,
  DEFAULT_EMPTY_SCORE,
  type RankableSearchResult,
  type RankingConfig,
} from "./ranker.js";

export const TIMELINE_RANKER_SOURCE_PATH =
  "timelineranker/server/src/main/scala/com/twitter/timelineranker/" +
  "uteg_liked_by_tweets/CombinedScoreAndTruncateTransform.scala";

export const TIMELINE_RANKER_SOURCE_SHA256 =
  "59bd8f6cbd22b5de994bbe6b1623997c8ee0994fee00be5a5f3aafdc4cc71269";

export const PLATFORM_ADAPTER_NAME = "OpenfeedCandidateEnvelopeAdapter";

export type DeliveryPlacement = "ranked" | "additional_reply" | "exploration";

export interface PlatformRankRequest<T extends RankableSearchResult> {
  candidates: readonly T[];
  realGraphScores: ReadonlyMap<string, number>;
  replyCandidateIds?: ReadonlySet<string>;
  config: RankingConfig;
  surface: "feed" | "assistant";
}

export interface DeliveredPlatformCandidate<T> {
  candidate: T;
  position: number;
  placement: DeliveryPlacement;
  realGraphScore: number;
  earlybirdScore: number;
  combinedScore: number;
}

export interface PlatformRankResult<T> {
  delivered: DeliveredPlatformCandidate<T>[];
  envelope: {
    searchResultCount: number;
    utegResultCount: number;
    replyCandidateCount: number;
  };
  provenance: {
    algorithm: "CombinedScoreAndTruncateTransform";
    adapter: typeof PLATFORM_ADAPTER_NAME;
    sourcePath: typeof TIMELINE_RANKER_SOURCE_PATH;
    sourceSha256: typeof TIMELINE_RANKER_SOURCE_SHA256;
    sourceUnmodified: true;
    surface: PlatformRankRequest<RankableSearchResult>["surface"];
  };
}

function assertPlatformContract<T extends RankableSearchResult>(
  request: PlatformRankRequest<T>,
): void {
  const candidateIds = new Set<string>();
  for (const candidate of request.candidates) {
    if (candidateIds.has(candidate.id)) {
      throw new Error(`CandidateEnvelope requires unique candidate ids; received ${candidate.id}.`);
    }
    candidateIds.add(candidate.id);

    if (
      candidate.earlybirdScore !== undefined &&
      !Number.isFinite(candidate.earlybirdScore)
    ) {
      throw new Error(`Earlybird score for ${candidate.id} must be finite.`);
    }
  }

  for (const [candidateId, score] of request.realGraphScores) {
    if (!candidateIds.has(candidateId)) {
      throw new Error(`UTEG score references unknown candidate ${candidateId}.`);
    }
    if (!Number.isFinite(score)) {
      throw new Error(`Real Graph score for ${candidateId} must be finite.`);
    }
  }

  const { maxCount, earlybirdScoreMultiplier, numAdditionalReplies } = request.config;
  if (!Number.isInteger(maxCount) || maxCount < 0) {
    throw new Error("maxCount must be a non-negative integer.");
  }
  if (
    !Number.isFinite(earlybirdScoreMultiplier) ||
    earlybirdScoreMultiplier < 0 ||
    earlybirdScoreMultiplier > 20
  ) {
    throw new Error("earlybirdScoreMultiplier must remain within its source bound of 0...20.");
  }
  if (
    !Number.isInteger(numAdditionalReplies) ||
    numAdditionalReplies < 0 ||
    numAdditionalReplies > 1_000
  ) {
    throw new Error("numAdditionalReplies must remain within its source bound of 0...1000.");
  }
}

/**
 * Transforms Openfeed's platform objects into the unchanged TimelineRanker
 * CandidateEnvelope contract, invokes the semantic port, and maps the delivery
 * back to platform objects. Personalization and query understanding happen
 * before this boundary; ranking behavior does not change inside it.
 */
export function rankPlatformCandidates<T extends RankableSearchResult>(
  request: PlatformRankRequest<T>,
): PlatformRankResult<T> {
  assertPlatformContract(request);

  const replyCandidateIds = request.replyCandidateIds ?? new Set<string>();
  const envelope = {
    searchResults: request.candidates,
    utegResults: request.realGraphScores,
    replyTweetIds: replyCandidateIds,
  };
  const trace = combinedScoreAndTruncateWithTrace(envelope, request.config);

  return {
    delivered: trace.results.map((candidate, index) => ({
      candidate,
      position: index + 1,
      placement: trace.randomResultIds.has(candidate.id)
        ? "exploration"
        : trace.additionalReplyIds.has(candidate.id)
          ? "additional_reply"
          : "ranked",
      realGraphScore:
        request.realGraphScores.get(candidate.id) ?? DEFAULT_EMPTY_SCORE,
      earlybirdScore: candidate.earlybirdScore ?? DEFAULT_EMPTY_SCORE,
      combinedScore: trace.scores.get(candidate.id) ?? DEFAULT_EMPTY_SCORE,
    })),
    envelope: {
      searchResultCount: request.candidates.length,
      utegResultCount: request.realGraphScores.size,
      replyCandidateCount: replyCandidateIds.size,
    },
    provenance: {
      algorithm: "CombinedScoreAndTruncateTransform",
      adapter: PLATFORM_ADAPTER_NAME,
      sourcePath: TIMELINE_RANKER_SOURCE_PATH,
      sourceSha256: TIMELINE_RANKER_SOURCE_SHA256,
      sourceUnmodified: true,
      surface: request.surface,
    },
  };
}
