import { afterAll, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

setDefaultTimeout(15000);

const processes = [];
const directories = [];
const serverPath = fileURLToPath(new URL("./server.js", import.meta.url));

async function start(env = {}) {
  const child = Bun.spawn([process.execPath, "run", serverPath], {
    cwd: dirname(serverPath),
    env: {
      ...process.env,
      PORT: "0",
      BASE_URL: "",
      RAILWAY_PUBLIC_DOMAIN: "",
      PUBLIC_DIR: "",
      ...env,
    },
    stdout: "pipe",
    stderr: "inherit",
  });
  processes.push(child);
  const reader = child.stdout.getReader();
  let output = "";
  while (!output.includes("\n")) {
    const chunk = await reader.read();
    if (chunk.done) throw new Error(`Server exited before startup: ${output}`);
    output += new TextDecoder().decode(chunk.value);
  }
  reader.releaseLock();
  const origin = output.match(/http:\/\/localhost:\d+/)?.[0];
  if (!origin) throw new Error(`Missing server URL: ${output}`);
  return origin;
}

async function create(origin, url = "https://example.com/a?b=1") {
  return fetch(`${origin}/api/links`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
}

afterAll(async () => {
  for (const child of processes) child.kill();
  await Promise.all(processes.map((child) => child.exited));
  await Promise.all(directories.map((directory) => rm(directory, { recursive: true, force: true })));
});

test("creates unique base62 links, lists them, redirects, and counts hits", async () => {
  const origin = await start();
  expect(await (await fetch(`${origin}/api/links`)).json()).toEqual([]);
  const response = await create(origin);
  expect(response.status).toBe(201);
  const link = await response.json();
  expect(Object.keys(link).sort()).toEqual(["code", "createdAt", "hits", "shortUrl", "url"]);
  expect(link.code).toMatch(/^[0-9A-Za-z]{6}$/);
  expect(link.url).toBe("https://example.com/a?b=1");
  expect(link.shortUrl).toBe(`${origin}/${link.code}`);
  expect(link.hits).toBe(0);
  expect(new Date(link.createdAt).toISOString()).toBe(link.createdAt);
  const second = await (await create(origin, "http://example.org")).json();
  expect(second.code).not.toBe(link.code);
  for (let count = 0; count < 2; count += 1) {
    const redirect = await fetch(link.shortUrl, { redirect: "manual" });
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("Location")).toBe(link.url);
    expect(redirect.headers.get("Access-Control-Allow-Origin")).toBe("*");
  }
  expect(await (await fetch(`${origin}/api/links`)).json()).toEqual([
    { ...link, hits: 2 }, second,
  ]);
  expect((await fetch(`${origin}/unknown`)).status).toBe(404);
  expect((await fetch(`${origin}/0000000`)).status).toBe(404);
});

test("rejects malformed JSON and invalid URLs without creating links", async () => {
  const origin = await start();
  for (const body of ["{", "null", "[]", "{}", '{"url":42}', '{"url":""}',
    '{"url":"/relative"}', '{"url":"ftp://example.com"}',
    '{"url":"javascript:alert(1)"}', '{"url":"https://"}']) {
    const response = await fetch(`${origin}/api/links`, { method: "POST", body });
    expect(response.status).toBe(400);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  }
  expect(await (await fetch(`${origin}/api/links`)).json()).toEqual([]);
});

test("supports cross-origin preflight and CORS on missing routes", async () => {
  const origin = await start();
  const response = await fetch(`${origin}/api/links`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://another-origin.example",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type",
    },
  });
  expect(response.status).toBe(204);
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  expect(response.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
  const missing = await fetch(`${origin}/missing`);
  expect(missing.status).toBe(404);
  expect(missing.headers.get("Access-Control-Allow-Origin")).toBe("*");
});

test("uses Railway origin and gives BASE_URL precedence", async () => {
  const railway = await start({ RAILWAY_PUBLIC_DOMAIN: "snip.up.railway.app" });
  const railwayLink = await (await create(railway)).json();
  expect(railwayLink.shortUrl).toBe(`https://snip.up.railway.app/${railwayLink.code}`);
  const custom = await start({
    BASE_URL: "https://snip.example/prefix/",
    RAILWAY_PUBLIC_DOMAIN: "ignored.up.railway.app",
  });
  const customLink = await (await create(custom)).json();
  expect(customLink.shortUrl).toBe(`https://snip.example/${customLink.code}`);
});

test("serves static files before codes, keeps API priority, and blocks traversal", async () => {
  const directory = await mkdtemp(join(tmpdir(), "snip-test-"));
  directories.push(directory);
  const publicDir = join(directory, "public");
  await mkdir(join(publicDir, "api"), { recursive: true });
  await writeFile(join(publicDir, "index.html"), "<h1>Snip</h1>");
  await writeFile(join(publicDir, "api", "links"), "not the API");
  await writeFile(join(directory, "secret.txt"), "private");
  const origin = await start({ PUBLIC_DIR: publicDir });
  expect(await (await fetch(origin)).text()).toBe("<h1>Snip</h1>");
  expect(await (await fetch(`${origin}/api/links`)).json()).toEqual([]);
  const link = await (await create(origin)).json();
  await writeFile(join(publicDir, link.code), "static wins");
  const response = await fetch(link.shortUrl, { redirect: "manual" });
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("static wins");
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  const listed = await (await fetch(`${origin}/api/links`)).json();
  expect(listed[0].hits).toBe(0);
  for (const path of ["/%2e%2e%2fsecret.txt", "/%2e%2e%5csecret.txt", "/%ZZ", "/missing"]) {
    expect((await fetch(`${origin}${path}`)).status).toBe(404);
  }
});