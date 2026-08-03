import { CANDIDATES } from "./candidates.js";
import {
  PLATFORM_ADAPTER_NAME,
  rankPlatformCandidates,
  TIMELINE_RANKER_SOURCE_PATH,
  TIMELINE_RANKER_SOURCE_SHA256,
} from "./platform-ranking-adapter.js";
import {
  TOPIC_OPTIONS,
  type AlgorithmInfo,
  type CandidatePost,
  type FeedResponse,
  type Topic,
} from "../shared/types.js";
import type { SessionRecord } from "./session-store.js";

export const DEFAULT_FEED_SETTINGS = {
  earlybirdMultiplier: 1.0,
  maxCount: 7,
  numAdditionalReplies: 1,
} as const;

export const ALGORITHM_INFO: AlgorithmInfo = {
  name: "CombinedScoreAndTruncateTransform",
  description:
    "TimelineRanker's light-ranking transform combines a relationship score with Earlybird's content score, then preserves exploration candidates and optionally includes useful replies.",
  equation: "combined = 1.0 × real graph + multiplier × earlybird",
  steps: [
    "Compute a combined score for every candidate.",
    "Set aside candidates marked as random exploration.",
    "Sort all other candidates by combined score, highest first.",
    "Reserve space for exploration candidates and truncate the sorted list.",
    "Optionally add replies from just below the cutoff.",
    "Append exploration candidates without ranking them.",
  ],
  constants: {
    realGraphWeight: 1.0,
    emptyScore: 0.0,
    defaultEarlybirdMultiplier: 1.0,
  },
  adapter: PLATFORM_ADAPTER_NAME,
  sourcePath: TIMELINE_RANKER_SOURCE_PATH,
  sourceSha256: TIMELINE_RANKER_SOURCE_SHA256,
  sourceUnmodified: true,
  dataNotice:
    "The open-source repository does not include X's live Earlybird index, UTEG graph, or user data. Openfeed uses clearly labeled synthetic candidates and local guest signals as compatible inputs.",
};

export function personalizedRealGraphScore(
  session: SessionRecord,
  candidate: CandidatePost,
): number {
  const baseScore = candidate.baseRealGraphScore ?? 0;
  const topicAffinity = session.affinities[candidate.topic];
  const directSignal =
    (session.likedPostIds.has(candidate.id) ? 0.05 : 0) +
    (session.savedPostIds.has(candidate.id) ? 0.03 : 0);

  return Math.min(1, baseScore + topicAffinity * 0.42 + directSignal);
}

function rankingReason(
  session: SessionRecord,
  topic: Topic,
  isExploration: boolean,
  isAdditionalReply: boolean,
): string {
  if (isExploration) {
    return "Exploration pick · set aside before ranking";
  }

  if (isAdditionalReply) {
    return "Conversation pick · added just below the cutoff";
  }

  const topicLabel = TOPIC_OPTIONS.find(({ id }) => id === topic)?.shortLabel ?? topic;
  const strength = session.affinities[topic] >= 0.65 ? "Strong signal" : "Growing signal";
  return `${strength} · ${topicLabel}`;
}

export function buildFeed(
  session: SessionRecord,
  earlybirdMultiplier: number = DEFAULT_FEED_SETTINGS.earlybirdMultiplier,
): FeedResponse {
  const candidates = CANDIDATES.filter(({ id }) => !session.hiddenPostIds.has(id));
  const realGraphScores = new Map(
    candidates.map((candidate) => [
      candidate.id,
      personalizedRealGraphScore(session, candidate),
    ]),
  );
  const replyTweetIds = new Set(
    candidates.filter(({ hasReply }) => hasReply).map(({ id }) => id),
  );

  const ranking = rankPlatformCandidates({
    candidates,
    realGraphScores,
    replyCandidateIds: replyTweetIds,
    config: {
      maxCount: DEFAULT_FEED_SETTINGS.maxCount,
      earlybirdScoreMultiplier: earlybirdMultiplier,
      numAdditionalReplies: DEFAULT_FEED_SETTINGS.numAdditionalReplies,
    },
    surface: "feed",
  });

  const posts = ranking.delivered.map((delivery) => {
    const post = delivery.candidate;
    const isExploration = delivery.placement === "exploration";
    const isAdditionalReply = delivery.placement === "additional_reply";

    return {
      ...post,
      rank: delivery.position,
      scores: {
        realGraph: delivery.realGraphScore,
        earlybird: delivery.earlybirdScore,
        earlybirdMultiplier,
        combined: delivery.combinedScore,
      },
      reason: rankingReason(session, post.topic, isExploration, isAdditionalReply),
      isLiked: session.likedPostIds.has(post.id),
      isSaved: session.savedPostIds.has(post.id),
      isExploration,
      isAdditionalReply,
    };
  });

  return {
    user: session.user,
    posts,
    topicSignals: TOPIC_OPTIONS.map(({ id }) => ({
      topic: id,
      value: session.affinities[id],
    })).sort((left, right) => right.value - left.value),
    settings: {
      earlybirdMultiplier,
      maxCount: DEFAULT_FEED_SETTINGS.maxCount,
      numAdditionalReplies: DEFAULT_FEED_SETTINGS.numAdditionalReplies,
    },
    candidateCount: candidates.length,
    generatedAt: new Date().toISOString(),
    algorithm: {
      name: ALGORITHM_INFO.name,
      equation: ALGORITHM_INFO.equation,
      adapter: ranking.provenance.adapter,
      sourcePath: ranking.provenance.sourcePath,
      sourceSha256: ranking.provenance.sourceSha256,
      sourceUnmodified: true,
    },
  };
}
