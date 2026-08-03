/**
 * Dependency-free semantic port of:
 * timelineranker/server/src/main/scala/com/twitter/timelineranker/
 * uteg_liked_by_tweets/CombinedScoreAndTruncateTransform.scala
 *
 * The production source remains untouched. This port preserves its score,
 * partition, sort, split, reply-injection, and random-append semantics. The
 * platform adapter owns all translation to and from Openfeed objects.
 */

export const DEFAULT_REAL_GRAPH_WEIGHT = 1.0;
export const DEFAULT_EMPTY_SCORE = 0.0;

export interface RankableSearchResult {
  id: string;
  earlybirdScore?: number;
  isRandomTweet?: boolean;
}

export interface CandidateEnvelope<T extends RankableSearchResult> {
  searchResults: readonly T[];
  utegResults: ReadonlyMap<string, number>;
  replyTweetIds: ReadonlySet<string>;
}

export interface RankingConfig {
  maxCount: number;
  earlybirdScoreMultiplier: number;
  numAdditionalReplies: number;
}

export interface RankingTrace<T> {
  results: T[];
  scores: ReadonlyMap<string, number>;
  topResultIds: ReadonlySet<string>;
  additionalReplyIds: ReadonlySet<string>;
  randomResultIds: ReadonlySet<string>;
}

export function combinedScore(
  realGraphScore: number | undefined,
  earlybirdScore: number | undefined,
  earlybirdScoreMultiplier: number,
): number {
  return (
    DEFAULT_REAL_GRAPH_WEIGHT * (realGraphScore ?? DEFAULT_EMPTY_SCORE) +
    earlybirdScoreMultiplier * (earlybirdScore ?? DEFAULT_EMPTY_SCORE)
  );
}

export function combinedScoreAndTruncateWithTrace<T extends RankableSearchResult>(
  envelope: CandidateEnvelope<T>,
  config: RankingConfig,
): RankingTrace<T> {
  const searchResultsAndScore = envelope.searchResults.map((searchResult) => {
    const realGraphScore = envelope.utegResults.get(searchResult.id);
    const score = combinedScore(
      realGraphScore,
      searchResult.earlybirdScore,
      config.earlybirdScoreMultiplier,
    );

    return { searchResult, score };
  });

  // Mirrors Scala's partition: random results retain input order and are not ranked.
  const randomSearchResults = searchResultsAndScore.filter(
    ({ searchResult }) => searchResult.isRandomTweet ?? false,
  );
  const otherSearchResults = searchResultsAndScore.filter(
    ({ searchResult }) => !(searchResult.isRandomTweet ?? false),
  );

  const sortedResults = [...otherSearchResults].sort((left, right) => right.score - left.score);
  // Scala splitAt returns an empty prefix for a negative index.
  const splitIndex = Math.max(0, config.maxCount - randomSearchResults.length);
  const topResults = sortedResults.slice(0, splitIndex).map(({ searchResult }) => searchResult);
  const remainingResults = sortedResults.slice(splitIndex).map(({ searchResult }) => searchResult);

  const additionalReplies =
    config.numAdditionalReplies > 0
      ? remainingResults
          .filter((result) => envelope.replyTweetIds.has(result.id))
          .slice(0, config.numAdditionalReplies)
      : [];

  const randomResults = randomSearchResults.map(({ searchResult }) => searchResult);
  const results = [...topResults, ...additionalReplies, ...randomResults];

  return {
    results,
    scores: new Map(searchResultsAndScore.map(({ searchResult, score }) => [searchResult.id, score])),
    topResultIds: new Set(topResults.map(({ id }) => id)),
    additionalReplyIds: new Set(additionalReplies.map(({ id }) => id)),
    randomResultIds: new Set(randomResults.map(({ id }) => id)),
  };
}

export function combinedScoreAndTruncate<T extends RankableSearchResult>(
  envelope: CandidateEnvelope<T>,
  config: RankingConfig,
): T[] {
  return combinedScoreAndTruncateWithTrace(envelope, config).results;
}
