import {
  ArrowRight,
  BarChart3,
  Bookmark,
  Check,
  ChevronRight,
  CircleUserRound,
  Compass,
  EyeOff,
  FlaskConical,
  GitBranch,
  Heart,
  Home,
  Info,
  Leaf,
  Lightbulb,
  LogOut,
  Menu,
  MessageCircle,
  Palette,
  RefreshCw,
  Repeat2,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TerminalSquare,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";

import { api, ApiError } from "./api.js";
import {
  TOPIC_OPTIONS,
  type AlgorithmInfo,
  type FeedResponse,
  type InteractionAction,
  type RankedPost,
  type SessionUser,
  type Topic,
} from "../shared/types.js";

const TOPIC_ICONS: Record<Topic, LucideIcon> = {
  ai: Sparkles,
  engineering: TerminalSquare,
  design: Palette,
  science: FlaskConical,
  climate: Leaf,
  culture: Lightbulb,
};

type AppView = "feed" | "signals";

interface ToastState {
  message: string;
  undoPostId?: string;
}

function formatMetric(value: number): string {
  return new Intl.NumberFormat("en", {
    notation: value >= 1_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatPublishedAt(isoDate: string): string {
  const published = new Date(isoDate);
  const elapsedMs = Date.now() - published.getTime();
  const elapsedHours = Math.max(0, Math.floor(elapsedMs / 3_600_000));

  if (elapsedHours < 1) return "now";
  if (elapsedHours < 24) return `${elapsedHours}h`;
  if (elapsedHours < 24 * 7) return `${Math.floor(elapsedHours / 24)}d`;

  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(published);
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function topicDetails(topic: Topic) {
  return TOPIC_OPTIONS.find(({ id }) => id === topic) ?? TOPIC_OPTIONS[0];
}

function LoadingScreen() {
  return (
    <main className="loading-screen" aria-label="Loading Openfeed">
      <Logo />
      <div className="loading-pulse" />
      <p>Finding your signals…</p>
    </main>
  );
}

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`logo ${compact ? "logo--compact" : ""}`} aria-label="Openfeed">
      <span className="logo__mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      {!compact && <span className="logo__word">openfeed</span>}
    </div>
  );
}

function Onboarding({
  onComplete,
}: {
  onComplete: (user: SessionUser) => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [interests, setInterests] = useState<Topic[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const toggleInterest = (topic: Topic) => {
    setInterests((current) => {
      if (current.includes(topic)) {
        return current.filter((item) => item !== topic);
      }
      return current.length < 4 ? [...current, topic] : current;
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (displayName.trim().length < 2 || interests.length === 0) return;

    setSubmitting(true);
    setError(undefined);
    try {
      const { user } = await api.createSession(displayName, interests);
      onComplete(user);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Your guest feed could not be started.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="onboarding">
      <header className="onboarding__nav">
        <Logo />
        <div className="onboarding__trust">
          <ShieldCheck size={16} />
          No password or email
        </div>
      </header>

      <div className="onboarding__layout">
        <section className="onboarding__intro">
          <div className="eyebrow">
            <span className="eyebrow__dot" />
            Open source ranking, made human
          </div>
          <h1>
            Your feed should
            <br />
            <em>make sense.</em>
          </h1>
          <p className="onboarding__lede">
            A calm, personal feed powered by X’s open-source TimelineRanker—with every score and
            signal available to inspect.
          </p>

          <form className="onboarding__form" onSubmit={submit}>
            <label htmlFor="display-name">What should we call you?</label>
            <div className="name-input">
              <CircleUserRound size={20} />
              <input
                id="display-name"
                autoFocus
                autoComplete="nickname"
                maxLength={32}
                placeholder="Your first name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </div>

            <div className="interest-heading">
              <div>
                <span>Choose your starting signals</span>
                <small>Pick 1–4</small>
              </div>
              <span>{interests.length}/4</span>
            </div>
            <div className="interest-grid">
              {TOPIC_OPTIONS.map((topic) => {
                const Icon = TOPIC_ICONS[topic.id];
                const selected = interests.includes(topic.id);
                return (
                  <button
                    className={`interest-chip ${selected ? "interest-chip--selected" : ""}`}
                    key={topic.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleInterest(topic.id)}
                    style={{ "--topic-color": topic.color } as CSSProperties}
                  >
                    <Icon size={18} />
                    <span>{topic.shortLabel}</span>
                    {selected && <Check className="interest-chip__check" size={15} />}
                  </button>
                );
              })}
            </div>

            {error && <p className="form-error">{error}</p>}

            <button
              className="primary-button"
              type="submit"
              disabled={submitting || displayName.trim().length < 2 || interests.length === 0}
            >
              {submitting ? "Building your feed…" : "Build my feed"}
              {!submitting && <ArrowRight size={18} />}
            </button>
            <p className="guest-note">
              <ShieldCheck size={14} />
              Instant guest access. Your choices stay in this app.
            </p>
          </form>
        </section>

        <section className="onboarding__preview" aria-label="How ranking works">
          <div className="preview-orbit preview-orbit--one" />
          <div className="preview-orbit preview-orbit--two" />
          <div className="preview-card">
            <div className="preview-card__head">
              <span>LIVE RANKING PREVIEW</span>
              <div className="live-pill">
                <span />
                Transparent
              </div>
            </div>
            <div className="preview-candidate preview-candidate--top">
              <div className="preview-avatar">MC</div>
              <div>
                <strong>Small evals, real tasks</strong>
                <span>Artificial intelligence</span>
              </div>
              <b>1.30</b>
            </div>
            <div className="score-composer">
              <div>
                <span>Relationship</span>
                <strong>0.38</strong>
                <small>your interests</small>
              </div>
              <span className="score-operator">+</span>
              <div>
                <span>Content</span>
                <strong>0.92</strong>
                <small>quality + recency</small>
              </div>
            </div>
            <div className="preview-equation">
              <GitBranch size={18} />
              <span>
                <small>COMBINED SCORE</small>
                1.0 × 0.38 + 1.0 × 0.92
              </span>
              <strong>1.30</strong>
            </div>
            <div className="preview-list">
              <div>
                <span className="preview-rank">2</span>
                <span className="preview-line preview-line--long" />
                <b>1.27</b>
              </div>
              <div>
                <span className="preview-rank">3</span>
                <span className="preview-line" />
                <b>1.19</b>
              </div>
              <div>
                <Compass size={15} />
                <span className="preview-line preview-line--short" />
                <small>Explore</small>
              </div>
            </div>
            <p className="preview-source">
              <Check size={14} />
              Original TimelineRanker behavior preserved
            </p>
          </div>
          <div className="preview-caption">
            <Sparkles size={17} />
            <span>
              <strong>No black box.</strong> Open any post to see why it ranked.
            </span>
          </div>
        </section>
      </div>
    </main>
  );
}

function Sidebar({
  view,
  onView,
  onAlgorithm,
  onLogout,
}: {
  view: AppView;
  onView: (view: AppView) => void;
  onAlgorithm: () => void;
  onLogout: () => void;
}) {
  return (
    <aside className="sidebar">
      <Logo />
      <nav className="sidebar__nav" aria-label="Main navigation">
        <button
          className={view === "feed" ? "active" : ""}
          onClick={() => onView("feed")}
          type="button"
        >
          <Home size={19} />
          <span>For you</span>
        </button>
        <button
          className={view === "signals" ? "active" : ""}
          onClick={() => onView("signals")}
          type="button"
        >
          <BarChart3 size={19} />
          <span>Your signals</span>
        </button>
        <button onClick={onAlgorithm} type="button">
          <GitBranch size={19} />
          <span>Algorithm</span>
        </button>
      </nav>
      <div className="sidebar__lower">
        <div className="open-source-note">
          <span className="open-source-note__icon">
            <ShieldCheck size={17} />
          </span>
          <div>
            <strong>Open by design</strong>
            <span>No ads. No passwords.</span>
          </div>
        </div>
        <button className="logout-button" onClick={onLogout} type="button">
          <LogOut size={18} />
          <span>Leave guest mode</span>
        </button>
      </div>
    </aside>
  );
}

function MobileHeader({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="mobile-header">
      <Logo />
      <button type="button" aria-label="Open menu" onClick={onMenu}>
        <Menu size={22} />
      </button>
    </header>
  );
}

function FeedHeader({
  user,
  feed,
  showScores,
  refreshing,
  onToggleScores,
  onRefresh,
}: {
  user: SessionUser;
  feed?: FeedResponse;
  showScores: boolean;
  refreshing: boolean;
  onToggleScores: () => void;
  onRefresh: () => void;
}) {
  const firstName = user.displayName.split(" ")[0];
  return (
    <header className="feed-header">
      <div>
        <span className="feed-header__greeting">
          {greeting()}, {firstName}
        </span>
        <h1>Your feed, explained.</h1>
        <p>
          {feed
            ? `${feed.candidateCount} candidates became ${feed.posts.length} picks—here’s why.`
            : "Turning your interests into a transparent ranking."}
        </p>
      </div>
      <div className="feed-header__actions">
        <button
          className={`score-toggle ${showScores ? "score-toggle--active" : ""}`}
          type="button"
          aria-pressed={showScores}
          onClick={onToggleScores}
        >
          <SlidersHorizontal size={17} />
          {showScores ? "Hide scores" : "Show scores"}
        </button>
        <button
          className="icon-button"
          type="button"
          aria-label="Refresh feed"
          onClick={onRefresh}
        >
          <RefreshCw className={refreshing ? "spin" : ""} size={18} />
        </button>
      </div>
    </header>
  );
}

function ScoreBreakdown({ post }: { post: RankedPost }) {
  const contentContribution = post.scores.earlybird * post.scores.earlybirdMultiplier;
  return (
    <div className="score-breakdown">
      <div className="score-breakdown__label">
        <span>
          <GitBranch size={14} />
          Why this position
        </span>
        <strong>{post.scores.combined.toFixed(3)}</strong>
      </div>
      <div className="score-rows">
        <div className="score-row">
          <span>Relationship</span>
          <div>
            <i style={{ width: `${Math.min(100, post.scores.realGraph * 100)}%` }} />
          </div>
          <b>{post.scores.realGraph.toFixed(2)}</b>
        </div>
        <div className="score-row score-row--content">
          <span>Content</span>
          <div>
            <i style={{ width: `${Math.min(100, (contentContribution / 2.5) * 100)}%` }} />
          </div>
          <b>
            {post.scores.earlybird.toFixed(2)} × {post.scores.earlybirdMultiplier.toFixed(2)}
          </b>
        </div>
      </div>
      <code>
        1.0 × {post.scores.realGraph.toFixed(2)} + {post.scores.earlybirdMultiplier.toFixed(2)} ×{" "}
        {post.scores.earlybird.toFixed(2)} = {post.scores.combined.toFixed(3)}
      </code>
    </div>
  );
}

function PostCard({
  post,
  showScores,
  busyAction,
  onInteract,
}: {
  post: RankedPost;
  showScores: boolean;
  busyAction?: string;
  onInteract: (post: RankedPost, action: InteractionAction, active?: boolean) => void;
}) {
  const topic = topicDetails(post.topic);
  return (
    <article className={`post-card ${post.isExploration ? "post-card--explore" : ""}`}>
      {post.isExploration && (
        <div className="explore-banner">
          <Compass size={15} />
          <span>Exploration pick</span>
          <small>Set aside before ranking, exactly as TimelineRanker specifies</small>
        </div>
      )}
      <div className="post-card__body">
        <div className="post-card__top">
          <div
            className="avatar"
            style={{ background: post.author.gradient }}
            aria-hidden="true"
          >
            {post.author.initials}
          </div>
          <div className="author">
            <div>
              <strong>{post.author.name}</strong>
              {post.author.verified && (
                <span className="verified" aria-label="Verified author">
                  <Check size={10} />
                </span>
              )}
              <span>{post.author.handle}</span>
              <span>·</span>
              <span>{formatPublishedAt(post.publishedAt)}</span>
            </div>
            <small>{post.author.title}</small>
          </div>
          <div className={`rank-badge ${post.isExploration ? "rank-badge--explore" : ""}`}>
            {post.isExploration ? <Compass size={14} /> : `#${post.rank}`}
          </div>
        </div>

        <p className="post-copy">{post.text}</p>

        {post.visual && (
          <div className="post-visual" style={{ background: post.visual.gradient }}>
            <div>
              <span>{post.visual.eyebrow}</span>
              <strong>{post.visual.value}</strong>
              <p>{post.visual.caption}</p>
            </div>
            <Sparkles size={25} />
          </div>
        )}

        <div className="reason-row">
          <span
            className="topic-dot"
            style={{ "--topic-color": topic.color } as CSSProperties}
          />
          <strong>{post.reason}</strong>
          {post.isAdditionalReply && <span className="reply-chip">Extra reply</span>}
          <span className="reason-row__score">{post.scores.combined.toFixed(2)}</span>
        </div>

        {showScores && <ScoreBreakdown post={post} />}

        <div className="post-actions">
          <button type="button" aria-label={`${post.metrics.replies} replies`}>
            <MessageCircle size={18} />
            <span>{formatMetric(post.metrics.replies)}</span>
          </button>
          <button type="button" aria-label={`${post.metrics.reposts} reposts`}>
            <Repeat2 size={18} />
            <span>{formatMetric(post.metrics.reposts)}</span>
          </button>
          <button
            className={post.isLiked ? "action-liked" : ""}
            type="button"
            aria-label={post.isLiked ? "Unlike post" : "Like post"}
            aria-pressed={post.isLiked}
            disabled={busyAction === `${post.id}:like`}
            onClick={() => onInteract(post, "like", !post.isLiked)}
          >
            <Heart size={18} fill={post.isLiked ? "currentColor" : "none"} />
            <span>{formatMetric(post.metrics.likes + (post.isLiked ? 1 : 0))}</span>
          </button>
          <span className="post-views">{formatMetric(post.metrics.views)} views</span>
          <button
            className={`action-icon ${post.isSaved ? "action-saved" : ""}`}
            type="button"
            aria-label={post.isSaved ? "Remove bookmark" : "Bookmark post"}
            aria-pressed={post.isSaved}
            disabled={busyAction === `${post.id}:save`}
            onClick={() => onInteract(post, "save", !post.isSaved)}
          >
            <Bookmark size={18} fill={post.isSaved ? "currentColor" : "none"} />
          </button>
          <button
            className="action-icon action-hide"
            type="button"
            aria-label="Not interested"
            disabled={busyAction === `${post.id}:not_interested`}
            onClick={() => onInteract(post, "not_interested", true)}
          >
            <EyeOff size={18} />
          </button>
        </div>
      </div>
    </article>
  );
}

function FeedSkeleton() {
  return (
    <div className="feed-skeleton" aria-label="Ranking feed">
      {[0, 1, 2].map((item) => (
        <div key={item}>
          <span />
          <i />
          <i />
          <i />
        </div>
      ))}
    </div>
  );
}

function TuningPanel({
  feed,
  multiplier,
  onMultiplier,
  onAlgorithm,
}: {
  feed?: FeedResponse;
  multiplier: number;
  onMultiplier: (value: number) => void;
  onAlgorithm: () => void;
}) {
  const presets = [
    { label: "Focused", value: 0.55 },
    { label: "Balanced", value: 1 },
    { label: "Explore", value: 1.65 },
  ];

  return (
    <aside className="tuning-panel">
      <section className="panel-card ranking-mix">
        <div className="panel-heading">
          <div>
            <span>Ranking mix</span>
            <small>Adjust content discovery</small>
          </div>
          <span className="live-pill">
            <i />
            Live
          </span>
        </div>
        <div className="weight-display">
          <div>
            <span>Relationship</span>
            <strong>1.0×</strong>
            <small>fixed by source</small>
          </div>
          <span>+</span>
          <div className="weight-display__active">
            <span>Content</span>
            <strong>{multiplier.toFixed(2)}×</strong>
            <small>your control</small>
          </div>
        </div>
        <label className="multiplier-slider">
          <span>
            <span>More personal</span>
            <span>More discovery</span>
          </span>
          <input
            type="range"
            min="0"
            max="2.5"
            step="0.05"
            value={multiplier}
            onChange={(event) => onMultiplier(Number(event.target.value))}
            aria-label="Earlybird content score multiplier"
          />
        </label>
        <div className="preset-row">
          {presets.map((preset) => (
            <button
              key={preset.label}
              className={Math.abs(multiplier - preset.value) < 0.01 ? "active" : ""}
              onClick={() => onMultiplier(preset.value)}
              type="button"
            >
              {preset.label}
            </button>
          ))}
        </div>
        <p className="mix-note">
          <Info size={14} />
          This changes an existing TimelineRanker parameter—not the algorithm.
        </p>
      </section>

      <section className="panel-card signal-card">
        <div className="panel-heading">
          <div>
            <span>Your strongest signals</span>
            <small>Updated by your choices</small>
          </div>
          <Zap size={18} />
        </div>
        <div className="signal-list">
          {feed?.topicSignals.slice(0, 4).map((signal) => {
            const topic = topicDetails(signal.topic);
            const Icon = TOPIC_ICONS[signal.topic];
            return (
              <div className="signal-item" key={signal.topic}>
                <span
                  className="signal-item__icon"
                  style={{ "--topic-color": topic.color } as CSSProperties}
                >
                  <Icon size={15} />
                </span>
                <div>
                  <span>
                    <strong>{topic.shortLabel}</strong>
                    <small>{Math.round(signal.value * 100)}%</small>
                  </span>
                  <i>
                    <b
                      style={{
                        "--signal-width": `${Math.round(signal.value * 100)}%`,
                        "--topic-color": topic.color,
                      } as CSSProperties}
                    />
                  </i>
                </div>
              </div>
            );
          }) ?? <div className="mini-skeleton" />}
        </div>
      </section>

      <button className="source-card" type="button" onClick={onAlgorithm}>
        <span className="source-card__icon">
          <GitBranch size={19} />
        </span>
        <span>
          <small>ALGORITHM SOURCE</small>
          <strong>TimelineRanker</strong>
          <em>Original behavior preserved</em>
        </span>
        <ChevronRight size={18} />
      </button>
    </aside>
  );
}

function SignalsView({ feed, onAlgorithm }: { feed: FeedResponse; onAlgorithm: () => void }) {
  return (
    <div className="signals-view">
      <header className="signals-header">
        <div className="eyebrow">
          <span className="eyebrow__dot" />
          Your local preference map
        </div>
        <h1>Signals you can see.</h1>
        <p>Likes, saves, and “not interested” choices tune relationship inputs—not the ranker.</p>
      </header>

      <section className="signal-overview">
        {feed.topicSignals.map((signal) => {
          const topic = topicDetails(signal.topic);
          const Icon = TOPIC_ICONS[signal.topic];
          return (
            <article
              key={signal.topic}
              style={{ "--topic-color": topic.color } as CSSProperties}
            >
              <span>
                <Icon size={20} />
              </span>
              <small>{topic.shortLabel}</small>
              <strong>{Math.round(signal.value * 100)}</strong>
              <div>
                <i style={{ width: `${Math.round(signal.value * 100)}%` }} />
              </div>
            </article>
          );
        })}
      </section>

      <section className="pipeline-card">
        <div className="pipeline-card__heading">
          <div>
            <span>How this feed was assembled</span>
            <small>One request, six observable stages</small>
          </div>
          <button type="button" onClick={onAlgorithm}>
            Read source notes <ChevronRight size={16} />
          </button>
        </div>
        <div className="pipeline">
          <div>
            <span className="pipeline__icon">
              <Save size={19} />
            </span>
            <strong>{feed.candidateCount}</strong>
            <small>Candidates</small>
          </div>
          <ChevronRight size={17} />
          <div>
            <span className="pipeline__icon">
              <GitBranch size={19} />
            </span>
            <strong>2 scores</strong>
            <small>Combined</small>
          </div>
          <ChevronRight size={17} />
          <div>
            <span className="pipeline__icon">
              <BarChart3 size={19} />
            </span>
            <strong>{feed.posts.length}</strong>
            <small>Feed picks</small>
          </div>
        </div>
        <code>{feed.algorithm.equation}</code>
      </section>

      <section className="score-table-card">
        <div className="pipeline-card__heading">
          <div>
            <span>Current score ledger</span>
            <small>Every delivered candidate, in feed order</small>
          </div>
          <span className="source-unchanged">
            <Check size={13} /> Source unchanged
          </span>
        </div>
        <div className="score-table">
          <div className="score-table__head">
            <span>Post</span>
            <span>Relationship</span>
            <span>Content</span>
            <span>Combined</span>
          </div>
          {feed.posts.map((post) => (
            <div className="score-table__row" key={post.id}>
              <span>
                <b>{post.isExploration ? <Compass size={14} /> : post.rank}</b>
                <span>
                  <strong>{post.author.name}</strong>
                  <small>{topicDetails(post.topic).shortLabel}</small>
                </span>
              </span>
              <span>{post.scores.realGraph.toFixed(3)}</span>
              <span>
                {post.scores.earlybird.toFixed(3)} × {post.scores.earlybirdMultiplier.toFixed(2)}
              </span>
              <strong>{post.scores.combined.toFixed(3)}</strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function AlgorithmModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [info, setInfo] = useState<AlgorithmInfo>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open || info) return;
    void api
      .getAlgorithm()
      .then(setInfo)
      .catch((requestError: unknown) =>
        setError(requestError instanceof Error ? requestError.message : "Source notes unavailable."),
      );
  }, [open, info]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    document.body.classList.add("modal-open");
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.classList.remove("modal-open");
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="algorithm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="algorithm-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modal-close" type="button" aria-label="Close" onClick={onClose}>
          <X size={20} />
        </button>
        <div className="algorithm-modal__hero">
          <span className="algorithm-modal__icon">
            <GitBranch size={24} />
          </span>
          <div>
            <span className="eyebrow">SOURCE TRANSPARENCY</span>
            <h2 id="algorithm-title">The ranking stays unchanged.</h2>
            <p>
              Openfeed adapts compatible inputs to the repository’s existing transform. It does not
              edit the original Scala algorithm.
            </p>
          </div>
        </div>

        {error && <p className="form-error">{error}</p>}
        {!info && !error && <div className="modal-loading">Reading source notes…</div>}
        {info && (
          <>
            <div className="modal-equation">
              <small>THE EXACT SCORE</small>
              <code>{info.equation}</code>
              <div>
                <span>
                  Real graph weight <strong>{info.constants.realGraphWeight.toFixed(1)}×</strong>
                </span>
                <span>
                  Default empty score <strong>{info.constants.emptyScore.toFixed(1)}</strong>
                </span>
              </div>
            </div>
            <div className="algorithm-steps">
              {info.steps.map((step, index) => (
                <div key={step}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <p>{step}</p>
                </div>
              ))}
            </div>
            <div className="source-path">
              <div>
                <Check size={16} />
                <span>
                  <strong>Source file untouched</strong>
                  <code>{info.sourcePath}</code>
                </span>
              </div>
            </div>
            <p className="data-notice">
              <Info size={16} />
              {info.dataNotice}
            </p>
          </>
        )}
      </section>
    </div>
  );
}

function MobileMenu({
  open,
  view,
  onClose,
  onView,
  onAlgorithm,
  onLogout,
}: {
  open: boolean;
  view: AppView;
  onClose: () => void;
  onView: (view: AppView) => void;
  onAlgorithm: () => void;
  onLogout: () => void;
}) {
  if (!open) return null;
  const selectView = (nextView: AppView) => {
    onView(nextView);
    onClose();
  };
  return (
    <div className="mobile-menu" role="dialog" aria-label="Navigation">
      <div>
        <Logo />
        <button type="button" aria-label="Close menu" onClick={onClose}>
          <X size={21} />
        </button>
      </div>
      <nav>
        <button
          className={view === "feed" ? "active" : ""}
          type="button"
          onClick={() => selectView("feed")}
        >
          <Home size={19} /> For you
        </button>
        <button
          className={view === "signals" ? "active" : ""}
          type="button"
          onClick={() => selectView("signals")}
        >
          <BarChart3 size={19} /> Your signals
        </button>
        <button
          type="button"
          onClick={() => {
            onClose();
            onAlgorithm();
          }}
        >
          <GitBranch size={19} /> Algorithm
        </button>
        <button type="button" onClick={onLogout}>
          <LogOut size={19} /> Leave guest mode
        </button>
      </nav>
    </div>
  );
}

function Dashboard({
  user,
  onLogout,
  onSessionExpired,
}: {
  user: SessionUser;
  onLogout: () => void;
  onSessionExpired: () => void;
}) {
  const [view, setView] = useState<AppView>("feed");
  const [feed, setFeed] = useState<FeedResponse>();
  const [multiplier, setMultiplier] = useState(1);
  const [showScores, setShowScores] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyAction, setBusyAction] = useState<string>();
  const [algorithmOpen, setAlgorithmOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toast, setToast] = useState<ToastState>();
  const [feedError, setFeedError] = useState<string>();

  const loadFeed = useCallback(
    async (nextMultiplier = multiplier) => {
      setRefreshing(true);
      setFeedError(undefined);
      try {
        const nextFeed = await api.getFeed(nextMultiplier);
        setFeed(nextFeed);
      } catch (requestError) {
        if (requestError instanceof ApiError && requestError.status === 401) {
          onSessionExpired();
          return;
        }
        setFeedError(
          requestError instanceof Error ? requestError.message : "Your feed could not be ranked.",
        );
      } finally {
        setRefreshing(false);
      }
    },
    [multiplier, onSessionExpired],
  );

  useEffect(() => {
    const debounce = window.setTimeout(() => void loadFeed(multiplier), feed ? 180 : 0);
    return () => window.clearTimeout(debounce);
    // loadFeed changes when multiplier does; feed is intentionally excluded from this trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiplier, user.id]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(undefined), 5_000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const interact = async (
    post: RankedPost,
    action: InteractionAction,
    active = true,
  ) => {
    const actionKey = `${post.id}:${action}`;
    setBusyAction(actionKey);

    if (action === "not_interested") {
      setFeed((current) =>
        current
          ? { ...current, posts: current.posts.filter(({ id }) => id !== post.id) }
          : current,
      );
    } else {
      setFeed((current) =>
        current
          ? {
              ...current,
              posts: current.posts.map((currentPost) =>
                currentPost.id === post.id
                  ? {
                      ...currentPost,
                      ...(action === "like" ? { isLiked: active } : { isSaved: active }),
                    }
                  : currentPost,
              ),
            }
          : current,
      );
    }

    try {
      await api.interact({ postId: post.id, action, active });
      if (action === "not_interested") {
        setToast({ message: `We’ll show you less ${topicDetails(post.topic).shortLabel}.`, undoPostId: post.id });
      }
      await loadFeed(multiplier);
    } catch (requestError) {
      setToast({
        message:
          requestError instanceof Error ? requestError.message : "That preference was not saved.",
      });
      await loadFeed(multiplier);
    } finally {
      setBusyAction(undefined);
    }
  };

  const undoHiddenPost = async (postId: string) => {
    setToast(undefined);
    try {
      await api.interact({ postId, action: "not_interested", active: false });
      await loadFeed(multiplier);
    } catch (requestError) {
      setToast({
        message: requestError instanceof Error ? requestError.message : "Undo was not available.",
      });
    }
  };

  const strongestTopic = useMemo(
    () => (feed?.topicSignals[0] ? topicDetails(feed.topicSignals[0].topic).shortLabel : undefined),
    [feed],
  );

  return (
    <div className="app-shell">
      <Sidebar
        view={view}
        onView={setView}
        onAlgorithm={() => setAlgorithmOpen(true)}
        onLogout={onLogout}
      />
      <MobileHeader onMenu={() => setMobileMenuOpen(true)} />

      <main className={`main-content ${view === "signals" ? "main-content--signals" : ""}`}>
        {view === "feed" ? (
          <>
            <FeedHeader
              user={user}
              feed={feed}
              showScores={showScores}
              refreshing={refreshing}
              onToggleScores={() => setShowScores((current) => !current)}
              onRefresh={() => void loadFeed(multiplier)}
            />
            {strongestTopic && (
              <div className="feed-context">
                <Sparkles size={14} />
                <span>
                  Your strongest signal is <strong>{strongestTopic}</strong>
                </span>
                <span className="feed-context__divider" />
                <span>Re-ranked locally just now</span>
              </div>
            )}
            {feedError && (
              <div className="feed-error">
                <span>{feedError}</span>
                <button type="button" onClick={() => void loadFeed(multiplier)}>
                  Try again
                </button>
              </div>
            )}
            {!feed ? (
              <FeedSkeleton />
            ) : (
              <div className={`feed-list ${refreshing ? "feed-list--refreshing" : ""}`}>
                {feed.posts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    showScores={showScores}
                    busyAction={busyAction}
                    onInteract={(targetPost, action, active) =>
                      void interact(targetPost, action, active)
                    }
                  />
                ))}
              </div>
            )}
            <div className="feed-end">
              <span>
                <Check size={16} />
              </span>
              <strong>You’re caught up</strong>
              <p>Openfeed keeps the list intentional, not infinite.</p>
            </div>
          </>
        ) : feed ? (
          <SignalsView feed={feed} onAlgorithm={() => setAlgorithmOpen(true)} />
        ) : (
          <FeedSkeleton />
        )}
      </main>

      {view === "feed" && (
        <TuningPanel
          feed={feed}
          multiplier={multiplier}
          onMultiplier={setMultiplier}
          onAlgorithm={() => setAlgorithmOpen(true)}
        />
      )}

      <AlgorithmModal open={algorithmOpen} onClose={() => setAlgorithmOpen(false)} />
      <MobileMenu
        open={mobileMenuOpen}
        view={view}
        onClose={() => setMobileMenuOpen(false)}
        onView={setView}
        onAlgorithm={() => setAlgorithmOpen(true)}
        onLogout={onLogout}
      />

      {toast && (
        <div className="toast" role="status">
          <span>{toast.message}</span>
          {toast.undoPostId && (
            <button type="button" onClick={() => void undoHiddenPost(toast.undoPostId!)}>
              Undo
            </button>
          )}
          <button type="button" aria-label="Dismiss" onClick={() => setToast(undefined)}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

export function App() {
  const [user, setUser] = useState<SessionUser | null>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    void api
      .getSession()
      .then(({ user: activeUser }) => setUser(activeUser))
      .catch((requestError: unknown) => {
        setError(
          requestError instanceof Error ? requestError.message : "Openfeed could not start.",
        );
        setUser(null);
      });
  }, []);

  const logout = async () => {
    try {
      await api.deleteSession();
    } finally {
      setUser(null);
    }
  };

  if (user === undefined) {
    return <LoadingScreen />;
  }

  if (!user) {
    return (
      <>
        <Onboarding onComplete={setUser} />
        {error && <div className="startup-error">{error}</div>}
      </>
    );
  }

  return (
    <Dashboard
      user={user}
      onLogout={() => void logout()}
      onSessionExpired={() => setUser(null)}
    />
  );
}
