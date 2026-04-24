import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, loadEnv, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

  return {
    plugins: [react(), vercelApiDevPlugin()],
  };
});

function vercelApiDevPlugin() {
  return {
    name: "grabmaps-vercel-api-dev",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const route = resolveApiRoute(url.pathname);

        if (!route) {
          next();
          return;
        }

        try {
          const body = await readRequestBody(req);
          const query = toVercelQuery(url.searchParams);
          if (route.params) Object.assign(query, route.params);

          const reqLike = Object.assign(req, {
            body,
            query,
            method: req.method,
          });
          const resLike = createVercelResponse(res);
          const mod = await server.ssrLoadModule(route.modulePath);
          await mod.default(reqLike, resLike);
        } catch (error) {
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
          }
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Local API failed" }));
        }
      });
    },
  };
}

function resolveApiRoute(pathname: string) {
  const routes: Record<string, string> = {
    "/api/map/style": "/api/map/style.ts",
    "/api/map/proxy": "/api/map/proxy.ts",
    "/api/poi/search": "/api/poi/search.ts",
    "/api/poi/nearby": "/api/poi/nearby.ts",
    "/api/poi/details": "/api/poi/details.ts",
    "/api/route": "/api/route.ts",
    "/api/reviews": "/api/reviews.ts",
    "/api/voice/tts": "/api/voice/tts.ts",
    "/api/chat": "/api/chat.ts",
    "/api/personality/duel": "/api/personality/duel.ts",
  };

  if (routes[pathname]) {
    return { modulePath: routes[pathname] };
  }

  const personalityMatch = pathname.match(/^\/api\/personality\/([^/]+)$/);
  if (personalityMatch) {
    return {
      modulePath: "/api/personality/[id].ts",
      params: { id: decodeURIComponent(personalityMatch[1]) },
    };
  }

  return null;
}

function toVercelQuery(searchParams: URLSearchParams) {
  const query: Record<string, string | string[]> = {};

  for (const [key, value] of searchParams) {
    const existing = query[key];
    if (Array.isArray(existing)) {
      existing.push(value);
    } else if (typeof existing === "string") {
      query[key] = [existing, value];
    } else {
      query[key] = value;
    }
  }

  return query;
}

async function readRequestBody(req: IncomingMessage) {
  if (req.method === "GET" || req.method === "HEAD") return undefined;

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (!chunks.length) return undefined;

  const raw = Buffer.concat(chunks).toString("utf8");
  const contentType = req.headers["content-type"] ?? "";
  if (contentType.includes("application/json")) {
    return raw ? JSON.parse(raw) : undefined;
  }

  return raw;
}

function createVercelResponse(res: ServerResponse) {
  const resLike = res as ServerResponse & {
    status: (code: number) => typeof resLike;
    json: (payload: unknown) => void;
    send: (payload: unknown) => void;
  };

  resLike.status = (code: number) => {
    res.statusCode = code;
    return resLike;
  };

  resLike.json = (payload: unknown) => {
    if (!res.headersSent) {
      res.setHeader("Content-Type", "application/json");
    }
    res.end(JSON.stringify(payload));
  };

  resLike.send = (payload: unknown) => {
    if (Buffer.isBuffer(payload) || typeof payload === "string") {
      res.end(payload);
      return;
    }

    resLike.json(payload);
  };

  return resLike;
}
