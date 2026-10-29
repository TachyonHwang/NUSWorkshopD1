import { randomInt } from "node:crypto";
import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

const links = new Map();
const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const configuredOrigin = process.env.BASE_URL
  ? new URL(process.env.BASE_URL).origin
  : process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : null;
const publicRoot = process.env.PUBLIC_DIR
  ? await realpath(resolve(process.env.PUBLIC_DIR))
  : null;

function json(body, status = 200) {
  return Response.json(body, { status, headers: cors });
}

function insideRoot(filePath) {
  const child = relative(publicRoot, filePath);
  return child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}

async function staticFile(pathname) {
  if (!publicRoot) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const candidate = resolve(publicRoot, `.${decoded === "/" ? "/index.html" : decoded}`);
  if (!insideRoot(candidate)) return null;
  try {
    const canonical = await realpath(candidate);
    if (!insideRoot(canonical)) return null;
    const file = Bun.file(canonical);
    return (await file.exists()) ? file : null;
  } catch (error) {
    if (["ENOENT", "ENOTDIR", "EINVAL"].includes(error.code)) return null;
    throw error;
  }
}

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  async fetch(request, server) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const { pathname } = new URL(request.url);
    if (pathname === "/api/links") {
      if (request.method === "GET") return json([...links.values()]);
      if (request.method !== "POST") {
        return new Response(null, {
          status: 405,
          headers: { ...cors, Allow: "GET, POST, OPTIONS" },
        });
      }

      let url;
      try {
        const body = await request.json();
        url = body?.url;
        if (typeof url !== "string") throw new Error("Missing URL");
        const parsed = new URL(url);
        if (!["http:", "https:"].includes(parsed.protocol)) {
          throw new Error("Unsupported protocol");
        }
      } catch {
        return json({ error: "Provide a valid http(s) URL in a JSON object." }, 400);
      }

      let code;
      do {
        code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join("");
      } while (links.has(code));

      const link = {
        code,
        url,
        shortUrl: `${configuredOrigin ?? `http://localhost:${server.port}`}/${code}`,
        hits: 0,
        createdAt: new Date().toISOString(),
      };
      links.set(code, link);
      return json(link, 201);
    }

    if (request.method === "GET" || request.method === "HEAD") {
      const file = await staticFile(pathname);
      if (file) {
        return new Response(request.method === "HEAD" ? null : file, {
          headers: { ...cors, "Content-Type": file.type },
        });
      }
    }

    if (request.method === "GET" && /^\/[0-9A-Za-z]{6}$/.test(pathname)) {
      const link = links.get(pathname.slice(1));
      if (link) {
        link.hits += 1;
        return new Response(null, {
          status: 302,
          headers: { ...cors, Location: link.url },
        });
      }
    }

    return json({ error: "Not found" }, 404);
  },
  error(error) {
    console.error(error);
    return json({ error: "Internal server error" }, 500);
  },
});

console.log(`Snip listening on http://localhost:${server.port}`);