import path from "node:path";

import cookieParser from "cookie-parser";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";

import { CANDIDATES } from "./candidates.js";
import { ALGORITHM_INFO, buildFeed, DEFAULT_FEED_SETTINGS } from "./feed-service.js";
import { SessionStore, type SessionRecord } from "./session-store.js";
import { TOPIC_OPTIONS, type InteractionAction, type Topic } from "../shared/types.js";

const COOKIE_NAME = "openfeed_session";
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const TOPIC_IDS = new Set<string>(TOPIC_OPTIONS.map(({ id }) => id));
const INTERACTION_ACTIONS = new Set<InteractionAction>(["like", "save", "not_interested"]);

interface AppOptions {
  store?: SessionStore;
  isProduction?: boolean;
  serveClient?: boolean;
}

interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

function sendError(
  response: Response<ApiErrorBody>,
  status: number,
  code: string,
  message: string,
): void {
  response.status(status).json({ error: { code, message } });
}

function parseMultiplier(value: unknown): number | undefined {
  if (value === undefined) {
    return DEFAULT_FEED_SETTINGS.earlybirdMultiplier;
  }

  const parsed = typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 20 ? parsed : undefined;
}

function normalizedName(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length < 2 || normalized.length > 32 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    return undefined;
  }

  return normalized;
}

function parsedTopics(value: unknown): Topic[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const uniqueTopics = [...new Set(value)];
  if (
    uniqueTopics.length < 1 ||
    uniqueTopics.length > 4 ||
    !uniqueTopics.every((topic): topic is Topic => typeof topic === "string" && TOPIC_IDS.has(topic))
  ) {
    return undefined;
  }

  return uniqueTopics;
}

export function createApp(options: AppOptions = {}): express.Express {
  const store = options.store ?? new SessionStore();
  const isProduction = options.isProduction ?? process.env.NODE_ENV === "production";
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: isProduction
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", "data:"],
              connectSrc: ["'self'"],
              fontSrc: ["'self'"],
              objectSrc: ["'none'"],
              baseUri: ["'self'"],
              frameAncestors: ["'none'"],
            },
          }
        : false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(express.json({ limit: "12kb" }));
  app.use(cookieParser());

  if (isProduction) {
    app.use("/api", (request: Request, response: Response, next: NextFunction) => {
      if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") {
        next();
        return;
      }

      const origin = request.get("origin");
      const host = request.get("host");
      if (origin && host && new URL(origin).host !== host) {
        sendError(response, 403, "ORIGIN_MISMATCH", "This request must come from Openfeed.");
        return;
      }
      next();
    });
  }

  const getSession = (request: Request): SessionRecord | undefined =>
    store.get(request.cookies?.[COOKIE_NAME] as string | undefined);

  app.get("/api/health", (_request, response) => {
    response.json({ status: "ok", service: "openfeed", algorithm: ALGORITHM_INFO.name });
  });

  app.get("/api/topics", (_request, response) => {
    response.json({ topics: TOPIC_OPTIONS });
  });

  app.get("/api/algorithm", (_request, response) => {
    response.json(ALGORITHM_INFO);
  });

  app.get("/api/session", (request, response) => {
    const session = getSession(request);
    response.json({ user: session?.user ?? null });
  });

  app.post("/api/session", (request, response) => {
    const displayName = normalizedName(request.body?.displayName);
    const interests = parsedTopics(request.body?.interests);

    if (!displayName) {
      sendError(
        response,
        400,
        "INVALID_NAME",
        "Use a display name between 2 and 32 characters.",
      );
      return;
    }

    if (!interests) {
      sendError(response, 400, "INVALID_INTERESTS", "Choose between 1 and 4 interests.");
      return;
    }

    const previousSessionId = request.cookies?.[COOKIE_NAME] as string | undefined;
    store.delete(previousSessionId);
    const session = store.create(displayName, interests);

    response.cookie(COOKIE_NAME, session.sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      maxAge: COOKIE_MAX_AGE_MS,
      path: "/",
    });
    response.status(201).json({ user: session.user });
  });

  app.delete("/api/session", (request, response) => {
    store.delete(request.cookies?.[COOKIE_NAME] as string | undefined);
    response.clearCookie(COOKIE_NAME, {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      path: "/",
    });
    response.status(204).send();
  });

  app.get("/api/feed", (request, response) => {
    const session = getSession(request);
    if (!session) {
      sendError(response, 401, "SESSION_REQUIRED", "Start a guest session to see your feed.");
      return;
    }

    const multiplier = parseMultiplier(request.query.multiplier);
    if (multiplier === undefined) {
      sendError(response, 400, "INVALID_MULTIPLIER", "The multiplier must be between 0 and 20.");
      return;
    }

    response.json(buildFeed(session, multiplier));
  });

  app.post("/api/interactions", (request, response) => {
    const session = getSession(request);
    if (!session) {
      sendError(response, 401, "SESSION_REQUIRED", "Start a guest session to shape your feed.");
      return;
    }

    const postId = typeof request.body?.postId === "string" ? request.body.postId : undefined;
    const action = request.body?.action as InteractionAction | undefined;
    const active = request.body?.active === undefined ? true : request.body.active;
    const post = CANDIDATES.find(({ id }) => id === postId);

    if (!post || !action || !INTERACTION_ACTIONS.has(action) || typeof active !== "boolean") {
      sendError(response, 400, "INVALID_INTERACTION", "That feed interaction is not valid.");
      return;
    }

    store.setInteraction(session, post, action, active);
    response.json({ ok: true });
  });

  app.use("/api", (_request, response) => {
    sendError(response, 404, "NOT_FOUND", "That API route does not exist.");
  });

  if (options.serveClient) {
    const clientDirectory = path.resolve(process.cwd(), "dist");
    app.use(express.static(clientDirectory, { index: false, maxAge: isProduction ? "1h" : 0 }));
    app.use((_request, response) => {
      response.sendFile(path.join(clientDirectory, "index.html"));
    });
  }

  app.use(
    (
      error: unknown,
      _request: Request,
      response: Response<ApiErrorBody>,
      _next: NextFunction,
    ) => {
      console.error("Unhandled request error", error);
      sendError(response, 500, "INTERNAL_ERROR", "Openfeed could not complete that request.");
    },
  );

  return app;
}
