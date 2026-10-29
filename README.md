# Generated Snip Bundle

Generated release output. Do not hand-edit these files.
Rebuild from main with `node scripts/build-bundle.mjs` (add `--push` to publish).

Run `bun server.js` from this directory. Bun loads `.env`, enabling the
bundled UI in `public/`. Run the CLI with `node cli.js ls`.
The package intentionally has no `type` field so the CLI remains CommonJS.
The Docker image includes `.env`; Railway uses the Dockerfile builder.
The current frontend source calls http://localhost:3000; remote browser
deployments need a source-layer API-origin change followed by a rebuild.

## Source Commits

| Layer | Commit |
| --- | --- |
| backend | 8302336a7b16e5431ee2cdfad20d08586c50dc56 |
| frontend | 64c290f8302a382a36c69e465c88752652825cd0 |
| cli | 7af8af322d4d67d4b2f55b4a41356a5515ab21d0 |
