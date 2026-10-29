# Snip CLI

Zero-dependency CommonJS CLI. Requires Node 18.17+ with global `fetch`; no install
or build step is needed. The backend defaults to `http://localhost:3000`.
Override its origin with the `SNIP_API` environment variable.

```sh
node cli.js add "https://example.com/a?one=1&two=2"
node cli.js ls
node cli.js open Ab12Cd
node cli.js help
```

`add` prints only the returned short URL. `ls` prints an aligned code/hits/URL
table, or `No links yet.`. `open` asks the backend for a redirect without following
it, then opens the HTTP(S) Location target using Windows `start`, macOS `open`,
or Linux `xdg-open`. Resolving a code increments its backend hit count.
Errors go to stderr with exit status 1; requests time out after 10 seconds.
Quote URL arguments, especially when they contain shell metacharacters.

Use `./snip` on POSIX, `.\snip.cmd` in cmd.exe, or `.\snip.ps1` in PowerShell.
All wrappers forward arguments and preserve the exit code. Alternatively,
`npm link` registers the `snip` command from the package's bin entry.

PowerShell configuration example:

```powershell
$env:SNIP_API = 'http://localhost:3000'
.\snip.ps1 ls
```

Run the built-in tests with `node --test cli.test.js`. Browser launches are mocked
in tests. Backend and frontend files remain on their respective branches; this
`cli` branch has an independent orphan history.