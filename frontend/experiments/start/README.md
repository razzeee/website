# Start migration experiment

This prototype asks whether selected Flathub public pages can reuse their
existing loaders and client UI under TanStack Start on Node. It is not a
production migration. Its build produces a standalone Node runtime artifact.

Install frontend dependencies first, then this directory's pinned dependencies.
Build from this directory; a Next build is not required:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm build
```

Run from `frontend` so the shared native image renderer can find its font files:

```sh
API_BASE_URI=http://127.0.0.1:4101 HOST=127.0.0.1 PORT=3001 \
  node --import ./experiments/start/instrument.server.mjs \
  experiments/start/.output/server/index.mjs
```

See `../../scripts/benchmark/README.md` for fixture capture and comparison.
Build configuration defaults to local API/site origins for the experiment.
The existing `NEXT_PUBLIC_*` build variables override those defaults; the Start
site defaults to port 3001. Runtime server calls use `API_BASE_URI`.
The build resolves shared dependencies from the parent checkout. Runtime
dependencies are traced into `.output/server/node_modules`.

The catch-all route adapts existing page functions into serializable props.
Prototype-only adapters provide navigation, images and internationalization.
Vite reuses the shared CSS and public assets. Vendored Inter subsets preserve
the existing typography and are emitted as hashed, self-hosted font assets.
CommonJS DOMPurify stays native on the server; browser imgproxy needs Buffer.
The shared QueryClient is made request-local through a build transform.

## Added parity support

- Redis-backed HTML and loader-data caching for the supported public routes,
  with zstd compression, one-hour hard expiry, distributed render leases,
  per-path invalidation generations and Redis-failure fallback. Authenticated
  requests bypass HTML caching; the non-personalized locale cookie is allowed.
  Errors, redirects, cookies and private responses are not stored as HTML.
- Sentry's Start SDK at the same version as Next's SDK, server preload and
  middleware, router tracing, and the shared client replay/scrubbing settings.
  Shared HTML omits origin trace metadata after Sentry's response wrapper,
  so CDN hits start independent browser traces. Private responses retain tracing.
- Shared login, email confirmation, developer/provider callback and settings UI.
  Server-rendered auth scaffolding is serialized through a limited component
  registry. Synthetic backend tests verify frontend behavior and session cookies.
- Shared native badge, app OG and year-in-review OG handlers. Both frameworks
  read headers and redirects from `../../http-policy.mjs`. Start compiles those
  source patterns directly, including redirect ordering and query preservation.

Invalidate HTML and loader data together using the deployment namespace:

```sh
REDIS_URL=redis://127.0.0.1:16379 GITHUB_SHA="$RELEASE" \
  node invalidate.mjs /en/apps/org.mozilla.firefox /en
```

Use an identical `GITHUB_SHA` on all instances of a deployment. Without it the
prototype uses a fixed development namespace, which must be cleared between builds.
The cache does not reproduce every Next ISR/L1/tag behavior; expiry and operational
semantics require staging verification. Retired release namespaces need cleanup.

The dispatcher now adapts all 71 source page shapes: home, app detail,
category/subcategory, eight collections, search, about, setup/distro, install,
badges, feeds, languages, consultants, privacy/terms, builds and its three subroutes,
statistics, banner preview, server-error/unauthorized pages, five login routes and settings,
16 admin pages, developer portal, donate, wallet, my-Flathub, three purchase pages,
payment entry and payment details, six app-management/new-app pages, both
app-purchase routes and year-in-review. This is route adaptation coverage, not
complete parameter, interaction or production validation.
Public additions are listed in `src/public-routes.mjs`; each uses an explicit
server loader and lazy client component. Setup preserves its server JSON-LD.

All 56 application locales share `../../src/i18n/locales.mjs`. Navigation,
public caching and app invalidation use that list, including script/region tags.
Unprefixed document URLs negotiate the exact supported `NEXT_LOCALE` cookie,
then best-fit `Accept-Language`, then English. Noncanonical locale-prefix casing
redirects to the supported spelling. The negotiation libraries and locale ordering
match the installed next-intl middleware. Shared configured redirects still run
first, including legacy app URLs that force English. Transports, assets, crawl
endpoints and the source proxy's dot-path exclusions are not negotiated.

Negotiated redirects preserve query strings and are private/no-store with
language/cookie variation. Server cookie synchronization applies only to those
redirects, not canonical localized HTML, so public documents retain CDN sharing.
Explicit client language switches through links or router push/replace update the
root-scoped, SameSite=Lax session preference before navigation. Rendering, hovering,
prefetching and ordinary same-language navigation leave it unchanged. Cross-language
links disable prefetch and expose their target language. Complete localized
middleware header parity is not implemented. The local Varnish fixture strips a sole locale
cookie only on explicitly supported canonical localized paths; it retains the
cookie on unprefixed paths for negotiation. Production edge configuration still
needs independent verification.
Root metadata comes from the shared locale metadata generator. The prototype
resolves inherited titles, descriptions, robots, Open Graph, Twitter and icons,
and includes the layout's RSS and preconnect links. Nested metadata replaces
parent fields, matching Next's shallow inheritance for the supported pages.

`routes.mjs` compares 82 page/locale combinations against Next, plus 19 redirects
and not-found cases. Browser diagnostics cover representative collection, setup,
distro and RTL pages in desktop/mobile light/dark variants. Distro logos have a
regression test ensuring exact filename case. Crawl endpoints reuse the existing
robots policy and sitemap handlers, including matching sitemap chunk sizes.
Builds retain their source layout and are excluded from shared HTML caching.
Feed handlers and full metadata coverage remain open.
Remaining cutover work also includes real identity-provider
and WebAuthn tests, payments, source-map uploads and
sustained-load/failure testing. Local Sentry collection verifies transport, not
production project ingestion. No production cutover is implied by this prototype.

## Protected routes

Before importing a protected page or running its loader, Start verifies the
incoming session cookie with `/auth/userinfo`. Anonymous, expired, malformed and
unverifiable sessions redirect to localized login with a local `returnTo` path.
Admin and developer entry points use developer login. Query strings are preserved.
Backend outages fail closed rather than rendering protected loader data.

The admin boundary uses the same shared permission predicate as the source admin
layout. Signed-in users without any admin permission redirect to unauthorized.
Permission-review detail additionally requires `moderation`, matching its source
guard; a different administrative permission does not suffice. Its serialized
props retain the source assessment identifier and its client moderation guard.
Page-specific client guards and backend API authorization remain in force; passing
the outer admin boundary does not grant every administrative permission.

Protected pages retain the source protected/admin layouts. Neither their HTML nor
server-function transport is shared at Redis/CDN. Authorization runs on every page
server-function call, including search changes. The catch-all's explicit loader
dependencies prevent query navigation from reusing a previous authorization result.
This does not remotely erase an already rendered page when a session is revoked;
the backend must still authorize every sensitive API request and mutation.

App management also verifies the source ownership condition (`dev_flatpaks`)
before loading the management page. Registration redirects users without a
publisher agreement to the source agreement page. Existing owners entering the
invitation route go directly to management. Invitation status and acceptance are
still checked by the source components and backend; these are not administrator
shortcuts. The six adapted app-management/new-app pages retain their source
login, publisher-agreement, verification, management and invitation components.

`src/protected-routes.mjs` lists the 33 adapted page shapes. Passing SSR and
boundary checks is not evidence that every administrative or payment operation
has been exercised end to end.

Developer portal reuses the existing documentation-feed loader. Payment entry
reuses the public-key loader, transaction ID, login guard and Stripe checkout
component. The regression runner supplies a frozen documentation feed and a
browser-only Stripe stub. It tests payment terms and appearance without confirming
a charge, and tests permission-review controls without submitting a decision.

Both app-purchase pages retain their source metadata and purchase/donation UI.
They require login but do not require publisher status or ownership of the app.
Year-in-review retains its server-rendered year selector and footer through the
bounded page-tree transport also used by authentication pages. The Next headers
adapter reads the active Start request, so only unreleased years forward the
request's cookie to the backend. The backend's `quality-moderation` preview gate
is authoritative. Published years do not forward session cookies. All year pages
remain private/no-store, matching their source dynamic-rendering behavior and
preventing a preview from entering public document or loader-data caches.

## Standalone runtime

The build's `postbuild` step copies the Sentry preload and invalidation tools
into `.output/server`. Nitro explicitly traces the dynamically loaded DOMPurify
dependency and the maintenance tool's Redis client. Packaging rejects symlinks
that escape the artifact. No dependency installation is required at runtime.

Copy the complete `.output` directory to the deployment host. Run from that
directory, where `public/assets/fonts` is available to the native image renderer:

```sh
node --import ./server/instrument.server.mjs server/index.mjs
node server/invalidate.mjs /en
```

From this source directory, `corepack pnpm start` uses that same runtime layout.

Alternatively, build the runtime-only image from this directory after building:

```sh
podman build --tag flathub-start:prototype .
podman run --rm --read-only --tmpfs /tmp --publish 3001:3000 \
  --env API_BASE_URI --env REDIS_URL --env SENTRY_DSN --env GITHUB_SHA \
  flathub-start:prototype
```

Use backend/Redis addresses reachable from the container. Browser-facing
`NEXT_PUBLIC_*` values remain build-time configuration. The image runs as the
unprivileged Node user and contains only the runtime artifact. Build for the
target platform using the pinned lockfiles; this is not a cross-platform package.
The build still uses the shared frontend source and its installed dependencies,
but does not read `.next` or download fonts. Production deployment integration and
full workflow validation remain separate work.

## CDN-first caching

Supported anonymous public documents advertise `public, max-age=0, s-maxage=300,
stale-while-revalidate=60`. Redis remains the origin fallback. The CDN freshness
window is capped by the cached HTML's remaining one-hour lifetime; the stale
window can extend serving by another minute. Loader data has its own origin TTL.
Query-bearing documents, credentials, private responses, errors, auth/settings
and server functions use `private, no-store`. Public loader data stays in Redis;
server-function transport is not shared at the CDN.

Hashed build output lives under `/build-assets/` with one-year immutable caching.
Unversioned public files are not given that policy. Existing external media
URLs continue to use their current CDN. The site's CDN can cache the new
build path directly; deployment must retain old hashed assets across releases.

Public pages carry `start-pages`, a locale/path-specific `page-<sha256>` key and,
for app details, the existing `app-<appId>` key. To invalidate Redis first and then
hard-purge Fastly, provide `FASTLY_SERVICE_ID` and `FASTLY_API_TOKEN` in the
environment and run from this directory:

```sh
node invalidate.mjs --cdn /en/apps/org.mozilla.firefox /en
```

This also needs `REDIS_URL` and the release's `GITHUB_SHA`; the CLI refuses to run
without either rather than falling back to the local prototype namespace. App invalidation covers
all supported application locales before purging the shared app key. Include affected
home/category paths explicitly. Without `--cdn`, the command invalidates Redis
and prints the outstanding CDN keys. Purge failures fail the command and should
be retried. The API targets the supplied Fastly service's production environment;
use a separate test service for staging. No live Fastly purge has been performed.

Existing backend purge events still need wiring to this coordinated path. A
Fastly-only purge cannot invalidate Redis. The two layers are not transactional:
an edge fill already in flight can race a purge. Deployment/publishing integration
must account for this and purge `start-pages` after activating a new release.

Production edge rules must pass session cookies, Authorization, range requests,
Start control headers and non-GET/HEAD methods before lookup. Only the locale
cookie may be normalized away on explicitly localized public paths. Preserve
host, path and query in cache keys, and honor Vary and no-store. The local Varnish
fixture verifies this contract; deployed Fastly rules are not present in this repo
and still require staging verification. See `../../scripts/benchmark/README.md`.

## Deployment environment contract

`NEXT_PUBLIC_*` settings are build-time values in this Vite prototype. Set the
site/API/search origins, search key, production flag, sitemap size, analytics site
and browser Sentry DSN explicitly for the target environment before building.
The prototype defaults are for local experiments, not a staging configuration.
Changing public variables when starting an already-built container does not
retarget its client or metadata. `NEXT_PUBLIC_IS_PRODUCTION=true` also permits
ordinary robots to crawl the site; keep real staging private or non-indexable.

At runtime, set `API_BASE_URI` to the internal backend route, `REDIS_URL` to the
frontend cache and `GITHUB_SHA` to the release namespace shared by every replica
and invalidation job. Supply the server Sentry DSN separately. The runtime image
copies `.output`; it does not build the frontend or consume Next Docker build args.
The local server can still use the prototype namespace for experiments, but
deployment must not rely on that fallback. The invalidation CLI requires an
explicit release and must run for every active release namespace during a rollout.

The repository's existing CI/deploy workflow still builds the Next Dockerfile,
uploads `.next/static` and finalizes its Sentry release. It does not deploy this
prototype. Cluster manifests and live Fastly configuration are not in this checkout.
The backend update worker invalidates `cache:endpoint:*`, not Start's release-scoped
documents; a publisher integration must explicitly call coordinated invalidation
with affected app and dependent page paths. This has only been tested locally.

## Automated checks

After installing both dependency sets, run `pnpm test` from `frontend` for the
shared Vitest suite. From this directory, run the cache/HTTP/authorization checks
against a dedicated Redis instance:

```sh
REDIS_URL=redis://127.0.0.1:16379 corepack pnpm test
```

This test runner owns a synthetic API/Sentry collector on port 4101, which must be
free. It does not require recorded public API data or contact external providers.
The `Start migration checks` workflow installs both lockfiles, runs these tests,
builds `.output` and checks the read-only runtime image. It does not publish an
image or deploy the site. Browser parity/benchmark runs still require the separate
fixture workflow documented under `scripts/benchmark`.
