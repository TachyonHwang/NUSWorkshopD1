# Snip Frontend

Minimal Angular 19 client: one standalone component, one HttpClient service,
and signals for UI state. The API endpoint is `http://localhost:3000/api/links`.

## Run

```sh
npm ci
npx ng serve
```

Open `http://localhost:4200`. Start the Bun backend from a separate checkout of
the `backend` branch on port 3000. That backend must allow cross-origin requests.
Paste an HTTP(S) URL to create a short link. Refresh the table to reload hit counts.

## Build And Test

```sh
npx ng build
npx ng test --watch=false --browsers=ChromeHeadless
```

The project is named `snip-frontend`; production browser files are generated in
`dist/snip-frontend/browser`. The `frontend` branch has an independent orphan
history; backend files remain on the `backend` branch.