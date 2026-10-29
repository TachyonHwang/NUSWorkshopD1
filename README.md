# Snip Backend

A single-file Bun URL shortener with zero npm dependencies. Links live in an
in-memory Map and disappear when the server restarts.

## Run

Install Bun (https://bun.sh), then run `bun start`. No dependency installation is
needed. Run the integration tests with `bun test`.

Configuration via environment variables:

| Variable | Default / behavior |
| --- | --- |
| `PORT` | `3000` |
| `BASE_URL` | Origin used for short URLs; takes precedence over Railway configuration. |
| `RAILWAY_PUBLIC_DOMAIN` | When `BASE_URL` is unset, use `https://$RAILWAY_PUBLIC_DOMAIN`. Otherwise fall back to `http://localhost:$PORT`. |
| `PUBLIC_DIR` | Optional static folder, resolved relative to the working directory. `/` serves `index.html`; existing files take precedence over short codes. |

## API

```sh
curl -X POST http://localhost:3000/api/links -H "Content-Type: application/json" -d '{"url":"https://example.com"}'
curl http://localhost:3000/api/links
curl -i http://localhost:3000/ABC123
```

- `POST /api/links`: returns `201` with `{ code, url, shortUrl, hits, createdAt }`.
  Invalid JSON or a non-HTTP(S) URL returns `400`.
- `GET /api/links`: returns `200` with all links in the same shape.
- `GET /:code`: returns `302` to the original URL and increments hits, or `404`.

Codes are six random base62 characters, hits start at zero, and timestamps are
ISO 8601. All responses allow cross-origin access; `OPTIONS` returns `204`.
API routes take precedence over static files. Static access is confined to the
configured folder, including resolved symbolic links. Serve only public files.
This demo has no authentication or persistence and is not production-hardened.