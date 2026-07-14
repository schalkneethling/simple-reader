# Cloudflare Pages frontend

Simple Reader is split into two deployments:

- **Cloudflare Pages** serves the Vite build from `dist/`.
- **Cloudflare Workers** serves the feed API at `/api/feed`.

## Create the Pages project

In Cloudflare Pages, connect `schalkneethling/simple-reader` and configure:

- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `dist`

Set the public Pages build variable `VITE_API_ORIGIN` to the HTTPS origin of the deployed Worker, without a trailing path. For example:

```text
https://simple-reader.<account-subdomain>.workers.dev
```

The frontend appends `/api/feed` itself. The value is public build-time configuration, not a secret.

## Allow Pages to call the Worker

Set the Worker configuration value `CORS_ALLOWED_ORIGINS` through Varlock to the Pages origin, then deploy the Worker:

```text
https://simple-reader.pages.dev
```

Once a custom Pages domain is active, include that exact HTTPS origin as well, separated by a comma, and redeploy the Worker. The API intentionally emits CORS headers only for configured origins.

## Add the Netlify-managed subdomain

After the Pages deployment succeeds, add the custom subdomain in the Pages dashboard first. Then create the CNAME record at Netlify DNS that Cloudflare Pages provides. This changes only the chosen subdomain; it does not require moving the parent zone or any existing Netlify subdomains.

## Manual Pages deployment

For a manual upload instead of Git integration, run:

```sh
npm run deploy:pages
```

The script builds with Varlock-managed configuration and deploys `dist/` to the `simple-reader` Pages project.
