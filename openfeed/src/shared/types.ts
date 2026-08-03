export const TOPIC_OPTIONS = [
  { id: "ai", label: "Artificial intelligence", shortLabel: "AI", color: "#8156d8" },
  { id: "engineering", label: "Engineering", shortLabel: "Engineering", color: "#3478c0" },
  { id: "design", label: "Product design", shortLabel: "Design", color: "#d05c76" },
  { id: "science", label: "Science", shortLabel: "Science", color: "#248573" },
  { id: "climate", label: "Climate", shortLabel: "Climate", color: "#5f8c3f" },
  { id: "culture", label: "Culture", shortLabel: "Culture", color: "#b56b2b" },
] as const;

export type Topic = (typeof TOPIC_OPTIONS)[number]["id"];

export interface Author {
  id: string;
  name: string;
  handle: string;
  title: string;
  initials: string;
  gradient: string;
  verified?: boolean;
}

export interface PostVisual {
  eyebrow: string;
  value: string;
  caption: string;
  gradient: string;
}

export interface PostMetrics {
  replies: number;
  reposts: number;
  likes: number;
  views: number;
}

export interface CandidatePost {
  id: string;
  author: Author;
  text: string;
  topic: Topic;
  publishedAt: string;
  earlybirdScore?: number;
  baseRealGraphScore?: number;
  isRandomTweet?: boolean;
  hasReply?: boolean;
  visual?: PostVisual;
  metrics: PostMetrics;
}

export interface ScoreBreakdown {
  realGraph: number;
  earlybird: number;
  earlybirdMultiplier: number;
  combined: number;
}

export interface RankedPost extends CandidatePost {
  rank: number;
  scores: ScoreBreakdown;
  reason: string;
  isLiked: boolean;
  isSaved: boolean;
  isExploration: boolean;
  isAdditionalReply: boolean;
}

export interface SessionUser {
  id: string;
  displayName: string;
  interests: Topic[];
  createdAt: string;
}

export interface TopicSignal {
  topic: Topic;
  value: number;
}

export interface FeedSettings {
  earlybirdMultiplier: number;
  maxCount: number;
  numAdditionalReplies: number;
}

export interface FeedResponse {
  user: SessionUser;
  posts: RankedPost[];
  topicSignals: TopicSignal[];
  settings: FeedSettings;
  candidateCount: number;
  generatedAt: string;
  algorithm: {
    name: string;
    equation: string;
    sourcePath: string;
    sourceUnmodified: true;
  };
}

export type InteractionAction = "like" | "save" | "not_interested";

export interface InteractionRequest {
  postId: string;
  action: InteractionAction;
  active?: boolean;
}

export interface AlgorithmInfo {
  name: string;
  description: string;
  equation: string;
  steps: string[];
  constants: {
    realGraphWeight: number;
    emptyScore: number;
    defaultEarlybirdMultiplier: number;
  };
  sourcePath: string;
  sourceUnmodified: true;
  dataNotice: string;
}

export interface AssistantSource {
  postId: string;
  author: string;
  handle: string;
  topic: Topic;
  excerpt: string;
  score: number;
}

export type AssistantMode = "model" | "grounded";

export interface AssistantResponse {
  id: string;
  question: string;
  headline: string;
  answer: string;
  takeaways: string[];
  sources: AssistantSource[];
  followUps: string[];
  mode: AssistantMode;
  generatedAt: string;
  pipeline: [
    { stage: "question"; label: string },
    { stage: "delete"; label: string },
    { stage: "simplify"; label: string },
    { stage: "accelerate"; label: string },
    { stage: "automate"; label: string },
  ];
}
