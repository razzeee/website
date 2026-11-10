# Framework baseline

These Node scripts establish an HTTP and public-API baseline
before comparing frameworks. Run commands from `frontend`. Store captured data
and results outside the checkout. Do not commit captured API responses.

## Capture once, replay for measurements

```sh
node scripts/benchmark/fixtures.mjs --mode record \
  --upstream https://flathub.org/api/v2 --directory "$FIXTURES"
```

The recorder captures anonymous GET responses, preserves repeated query values
and their order, and stores checksummed response bytes. Existing captures are
reused. It refuses credentials, mutation requests and account endpoints.
The anonymous `/auth/login` provider listing is allowed; login callbacks are not.
Use a dedicated empty directory for a fresh snapshot. Recording is data preparation,
not a benchmark. Requests are forwarded only on missing captures.

Point **both** build-time and runtime API settings at the fixture service:

```sh
export NEXT_PUBLIC_API_BASE_URI=http://127.0.0.1:4100
export API_BASE_URI=http://127.0.0.1:4100
export NEXT_PUBLIC_SITE_BASE_URI=http://127.0.0.1:3000
export NEXT_STATIC_LOCALES=en
export ENABLE_SENTRY=false
export NEXT_TELEMETRY_DISABLED=1
corepack pnpm build
```

Stop the recorder and restart with `--mode replay` and the same directory.
Replay never contacts the upstream and returns 502 for absent or corrupt
fixtures. Inspect `/__fixtures/stats`; any missing/error response invalidates a
run, even if a page's fallback returned HTTP 200. Capture runtime-only API calls
before freezing the fixture set. Date-dependent routes require the same clock
at capture, build and runtime; the scripts do not freeze the application clock.

The production app still requires its configured Redis service. Run with a
dedicated Redis instance; never clear shared Redis for an experiment. The
production asset prefix still points at the CDN, so this HTTP runner does not
establish local browser asset or hydration parity.

For example, start an isolated rootless Podman Redis instance. The cache handler
requires keyspace notifications; omitting them causes cache initialization to fail.
Pin the image digest when collecting comparable runs.

```sh
podman run --detach --rm --name flathub-benchmark-redis \
  --publish 127.0.0.1:16379:6379 docker.io/library/redis:7-alpine \
  redis-server --save '' --appendonly no --notify-keyspace-events Exe
REDIS_URL=redis://127.0.0.1:16379 HOSTNAME=127.0.0.1 PORT=3000 \
  NODE_OPTIONS=--max-old-space-size=2048 node .next/standalone/server.js
```

Use the standalone entry point rather than `next start`, matching deployment.
Keep the API environment exports above when launching it. For browser or image
endpoint tests, also stage public/static assets and `src/data` as the Dockerfile
does. Stop the server and remove the dedicated Redis container when finished:
`podman stop flathub-benchmark-redis`.

## HTTP diagnostics

Against a running production server:

```sh
node scripts/benchmark/http.mjs --base-url http://127.0.0.1:3000 \
  --fixture-url http://127.0.0.1:4100 --samples 30 \
  --label next-baseline --output "$RESULTS/baseline.json"
```

The output includes every request, errors, status/content checks, selected
headers, response hashes, decoded bytes, time to response headers and complete
body, source revision, working-tree status and host metadata. Failures are
retained and cause a nonzero exit. p50/p95 use nearest-rank successful samples;
always inspect failure counts. Content markers are smoke checks, not complete
feature or SEO parity. Supply `--routes path.json` for other route expectations.

This is a sequential diagnostic with **uncontrolled cache state**, not a load
test or a browser benchmark. It does not measure LCP, interaction latency,
hydration, CPU, cold-start isolation or sustained memory. Build fixture capture
and first-run cache population must not be reported as warm baseline timings.
Do not infer framework gains from repeated requests to one warmed server.

Before A/B comparisons: pin fixture and lockfile checksums, clock, Node version,
hardware/resources and build settings; verify populated content and full parity;
control and observe each cache tier; randomize independent paired runs. Keep
browser/search POST fixtures, sandbox auth, matched assets, cache invalidation,
soak testing and cost analysis as explicit additional stages. Search here checks
only its HTML shell. Full-site build time cannot be compared to a small prototype.

## Harness tests

```sh
node --test scripts/benchmark/*.check.mjs
```

## Paired prototype diagnostic

The Start prototype in `experiments/start` uses port 4101 for its API origin.
Pass `--port 4101` to the fixture recorder/replayer for this experiment.
Build Next with both API variables set to that same origin before comparing.
Install the prototype's separate lockfile with `corepack pnpm install
--frozen-lockfile` in that directory, then run `corepack pnpm build` there.
Start builds independently of `.next`: it vendors the existing Inter subsets
and shares source-controlled HTTP policy with Next. Both builds are required
for comparison, but either can be built first.
For local telemetry collection, build both with
`NEXT_PUBLIC_SENTRY_DSN=http://public@127.0.0.1:4101/1`.
Use site origins 3000 for Next and 3001 for Start, since auth redirect validation
must match each application's actual origin. Canonical comparisons normalize only
these local port differences.

With both builds ready and ports 4101 and 3002 free:

```sh
node scripts/benchmark/cache.mjs --directory "$FIXTURES" \
  --output "$RESULTS/paired" --samples 30 --prime --arms next,start
```

This owns and removes a dedicated Podman Redis container and runs its own
fixture/sandbox server. Each arm starts a new process, primes `/en/about`, requests
one target route, then repeats it. Arm order is seeded and randomized within
each route/block pair. Both must report MISS then HIT, and hits must make zero
backend calls. Both initialize Sentry; Start uses its server preload entry.
Priming a different route does not warm all target-specific code. These are
integration diagnostics, not proof of equivalent expiry, streaming, deployment
or sustained-load behavior. Inspect API request counts as well as time.

## Browser parity

Start the fixture replay service on 4101 and production servers on 3000/3001.
Stage Next standalone assets as described above. Playwright Chromium is required.

```sh
node scripts/benchmark/browser.mjs --label next \
  --output "$RESULTS" --assets "$ASSETS" --record
node scripts/benchmark/browser.mjs --label start \
  --base-url http://127.0.0.1:3001 --output "$RESULTS" --assets "$ASSETS" --record
# Repeat both commands without --record after freezing the asset collection.
node scripts/benchmark/compare.mjs --directory "$RESULTS"
```

Four English public pages are checked in desktop/mobile and light/dark variants,
plus home-to-category navigation. The comparator checks content and selected
metadata, browser errors and broken images. The homepage check waits for an
interactive carousel before capture; SSR content alone does not prove hydration.
Screenshot differences are diagnostic, including carousel autoplay timing.
Script sizes are gzip-compressed response bodies, not actual wire transfer sizes.
Browser cache is disabled by interception, CSP is bypassed for the fixture origin,
anonymous auth/analytics are stubbed, and Next speculative prefetch is disabled.
These checks do not validate production security, prefetch, authenticated flows,
search results, all locales, native endpoints or browser performance.

## Auth, native endpoints and telemetry

Use the local sandbox instead of the fixture-only server for these checks:

```sh
node scripts/benchmark/sandbox.mjs --directory "$FIXTURES" --port 4101
```

Launch both servers with `SENTRY_DSN=http://public@127.0.0.1:4101/1`,
`API_BASE_URI=http://127.0.0.1:4101` and a dedicated `REDIS_URL`.
Launch Start from `frontend` so native image fonts resolve correctly:

```sh
HOST=127.0.0.1 PORT=3001 node \
  --import ./experiments/start/instrument.server.mjs \
  experiments/start/.output/server/index.mjs
node scripts/benchmark/flows.mjs --output "$RESULTS" --assets "$ASSETS"
node scripts/benchmark/endpoints.mjs --output "$RESULTS"
```

The auth suite drives email submission, invalid links, conflicts, rate limiting,
successful session cookies, authenticated/anonymous settings and an OAuth callback
in four variants on both frameworks. It injects a deliberate client error and
requires a successful Sentry collector response. It enforces CSP with just the
local API/Sentry connect origin added. API transport is intercepted to avoid
Chromium loopback-access restrictions. The backend is synthetic: this does not
verify real email delivery, OAuth provider exchanges, WebAuthn or payments.
No mutations are forwarded upstream. The sandbox must never be deployed.

The endpoint suite compares native SVG/PNG bytes, invalid inputs, redirects and
security headers, and checks shared HTML contains no origin Sentry trace.
Record `/is-fullscreen-app/org.mozilla.firefox` and
`/year-in-review/2025?locale=en` in addition to the public-page fixtures.
App image assets may be fetched live; endpoint checks are not timing benchmarks.

From `experiments/start`, with the dedicated Redis and sandbox running:

```sh
node --test tests/cache.check.mjs
SENTRY_DSN=http://public@127.0.0.1:4101/1 node \
  --import ./instrument.server.mjs --test tests/telemetry.check.mjs
```

## CDN contract check

With the Start production server on 3001, sandbox on 4101 and dedicated Redis
running, start a local Varnish proxy from `frontend`:

```sh
podman run --detach --rm --name flathub-cdn-edge --network host \
  --volume "$PWD/scripts/benchmark/cdn.vcl:/etc/varnish/default.vcl:ro,Z" \
  docker.io/library/varnish@sha256:3f3df388d03695f4ff1efe75cc69a4311d8c5d44411cd99d2f0707056b056f29 \
  varnishd -F -a 127.0.0.1:3003 -f /etc/varnish/default.vcl -s malloc,64m
node scripts/benchmark/cdn.mjs --output "$RESULTS"
podman stop flathub-cdn-edge
```

Export the same `REDIS_URL` and `GITHUB_SHA` for the server and check. The check
verifies MISS/HIT documents and immutable assets, credential/query/auth bypass,
trace-free cached HTML, surrogate-key purging and a fresh Redis MISS after purge.
The VCL has local-only purge controls and is a test fixture, not deployment config.
It models the expected edge contract rather than reproducing deployed Fastly VCL.
TTL/stale policy is checked in `experiments/start/tests/cdn.check.mjs`; the edge
check does not wait for real expiry or simulate background-revalidation failures.
Fastly's purge API contract is documented at
https://www.fastly.com/documentation/reference/api/purging/.

## Expanded routes, locales and metadata

With both production servers and the fixture sandbox running:

```sh
node scripts/benchmark/routes.mjs --output "$RESULTS"
node scripts/benchmark/browser.mjs --label next --output "$RESULTS/browser" \
  --assets "$ASSETS" --record \
  --path /en/apps/collection/popular/1 --path /zh-Hans/setup \
  --path /nb-NO/setup/Ubuntu --path /ar/about
node scripts/benchmark/browser.mjs --label start --base-url http://127.0.0.1:3001 \
  --output "$RESULTS/browser" --assets "$ASSETS" \
  --path /en/apps/collection/popular/1 --path /zh-Hans/setup \
  --path /nb-NO/setup/Ubuntu --path /ar/about
node scripts/benchmark/compare.mjs --directory "$RESULTS/browser"
```

Capture collection fixtures with `page=1&per_page=30&locale=en` for popular,
trending, verified, mobile, recently-added, recently-updated and developer/Mozilla.
Also capture `/collection/keyword?keyword=Utility&locale=en&page=1&per_page=30`
and `/collection/category/game/subcategories?page=1&per_page=30&locale=en&subcategory=emulator&sort_by=trending`.
Use the same frozen fixture directory for both frameworks. Current homepage
app-pick requests may require additional date-specific captures.

The route check parses complete SSR responses, including streamed content. It
compares translated titles, metadata, canonical/icon/RSS links, document language
and direction, headings and JSON-LD across seven locales. It normalizes local
site origins and the two shared image asset URLs, deduplicates preconnects and
ignores JSON-LD script ordering. The shared image bytes must match the generated
Next assets. HTTP status checks cover localized redirects and malformed routes.

The browser check accepts repeated `--path` options and additionally exercises
a Chinese setup-to-distro navigation. Its existing desktop/mobile light/dark
matrix and strict error reporting still apply. The shared distro-logo regression
test checks public filenames with matching case.

Run `node scripts/benchmark/crawl.mjs --output "$RESULTS"` to compare robots and
sitemap GET/HEAD responses. Include `/appstream` in the frozen API fixtures so
app sitemap chunks are exercised, rather than comparing only empty fallbacks.
Use the same `NEXT_PUBLIC_SITEMAP_SIZE` for both builds (the repository default is
3000). The crawl check covers static and app chunks plus invalid chunk IDs.

## Protected layout and authorization checks

Run the sandbox. Prepare the frozen documentation feed and launch Start with the
test-only feed preload (from `frontend`):

```sh
node --input-type=module -e '
  import { writeFileSync } from "node:fs"
  import { documentationFeed } from "./scripts/benchmark/protected-fixtures.mjs"
  writeFileSync(process.argv[1], JSON.stringify(documentationFeed))
' "$RESULTS/documentation-feed.json"
DOCUMENTATION_FEED_FIXTURE="$RESULTS/documentation-feed.json" \
  API_BASE_URI=http://127.0.0.1:4101 HOST=127.0.0.1 PORT=3001 \
  node --import ./experiments/start/instrument.server.mjs \
  --import ./scripts/benchmark/documentation-fixture.mjs \
  experiments/start/.output/server/index.mjs
```

Then run:

```sh
node scripts/benchmark/protected.mjs --output "$RESULTS" --assets "$ASSETS" \
  --edge-base http://127.0.0.1:3003
```

The edge option requires the local Varnish fixture and is optional. The runner
checks all adapted protected routes plus settings with anonymous, expired,
ordinary, admin and moderator sessions. Browser checks cover desktop/mobile light/dark,
localized login redirects, authenticated settings, admin users, and permission
revocation during client-side search navigation. Server-function and document
responses must remain private; repeated edge requests must bypass shared caches.
The sandbox admin cookie grants only `view-users`; its empty users-list response
is synthetic. The moderator cookie grants `moderation`, required by review detail.
The runner also checks developer news, review rationale controls and payment terms
with dark/light Stripe appearance. It rejects any live Stripe network request or
state-changing API request. The browser Stripe stub does not create payment fields
or process charges; it only supplies the Elements context needed by the terms
screen. No real admin operation or payment is performed.

`documentation-fixture.mjs` intercepts only the server's fixed documentation-feed
URL. It is a test preload, not a production configuration or bundled runtime
dependency. Without it, the source loader fetches the real public documentation
feed. Synthetic transaction/review data comes from the sandbox, not the live API.

For the existing email/OAuth regression runner, launch Next on port 3005 and Start
on port 3006 while retaining their build-time site origins at ports 3000 and 3001:

```sh
node scripts/benchmark/flows.mjs --output "$RESULTS" --assets "$ASSETS" \
  --next-upstream http://127.0.0.1:3005 \
  --start-upstream http://127.0.0.1:3006
```

The optional upstream arguments bind local CSP-adjusting proxies on the configured
site ports. These must be free. Redirected documents bypass Playwright routing,
so response-header interception alone cannot add the sandbox connect origin to
every destination. `csp-proxy.mjs` preserves CSP except for that local API/Sentry
origin. Keeping the configured site ports also preserves real redirect-origin
validation. The protected runner uses the same helper for its browser requests.

## App management, invitations and publisher agreements

With Start, Redis, the sandbox and optional Varnish running as above:

```sh
node scripts/benchmark/app-management.mjs --output "$RESULTS" --assets "$ASSETS" \
  --edge-base http://127.0.0.1:3003
```

The runner covers the six management/new-app routes with anonymous, non-owner,
publisher, owner and invited sessions. Browser suites exercise the agreement-gated
registration form, pending invitation agreement/acceptance, non-owner and missing
invitation denial, desktop tabs/mobile management selector and already-owner
redirects. Both the registration agreement and invitation agreement go through
the real frontend mutations against the local sandbox. The only allowed writes
are local publisher-agreement acceptance and local invitation acceptance. It does
not register or upload an app, verify a real domain, alter a real invitation or
enter a real publisher agreement.

The sandbox holds agreement/ownership state for these synthetic sessions. The
management and protected runners reset it at startup; run these stateful runners
sequentially. The management runner additionally resets before each browser
variant. Management API fixtures use a synthetic desktop app so source maintenance,
verification, payment and upload sections remain available without live backend
access. The workflow checks interact with reviews/maintenance, not destructive
settings or upload-token creation.

## App purchases and year-in-review

With the production servers, sandbox and optional Varnish running:

```sh
node scripts/benchmark/final-routes.mjs --output "$RESULTS" --assets "$ASSETS" \
  --edge-base http://127.0.0.1:3003 --next-base http://127.0.0.1:3000
```

The Next comparison is optional and uses its existing production artifact. The
runner compares purchase/donation titles and robots, plus localized year canonical,
Open Graph and Twitter metadata. It normalizes the local site ports and shared
card-image URL; verify the public and generated card image bytes are identical.

The source release rule determines which year is public. Before December 15, the
runner exercises current-year previews with a synthetic `quality-moderation`
session, rejects ordinary/moderator sessions and checks concurrent session
isolation. On or after December 15 no current-year preview exists, so that check
is reported as not applicable. Public-year backend requests must never forward
the caller's session cookie. All year documents and purchase routes must bypass
shared caching, including error responses.

Four browser variants cover both purchase routes in paid and donation modes,
amount validation, synthetic purchase-intent POSTs and redirects to payment entry,
public-year rendering and year navigation. A Stripe stub prevents live payment
traffic. Only the local purchase-intent endpoint may be written; payment terms
are rendered but no charge is confirmed. The sandbox year endpoint mirrors the
backend's `quality-moderation` preview requirement. These are frontend contract
tests, not production backend or Stripe verification.

## Unprefixed locale negotiation

Run the Next and Start production artifacts on ports 3000 and 3001, plus the
sandbox for protected-route authorization. Optionally run Varnish on port 3003:

```sh
node scripts/benchmark/locales.mjs --output "$RESULTS" \
  --edge-base http://127.0.0.1:3003
```

This compares GET/HEAD redirect status, destination and locale cookie with Next
for default, header and cookie selection, all supported locales, locale casing,
malformed language preferences, query strings, redirect precedence and fetch
destinations. Negotiated responses must be private/no-store and vary on language
and cookie. Alternating preferences exercise edge isolation on unprefixed paths.
Protected-route chains verify locale selection before authorization and exact
query-preserving login return paths. It does not compare Next's weaker protected
page authorization with Start's server guard. It also does not claim full next-intl
header parity on canonical localized documents.

For client language preferences, with Start, the sandbox and optional Varnish running:

```sh
node scripts/benchmark/language-switch.mjs --output "$RESULTS" --assets "$ASSETS" \
  --edge-base http://127.0.0.1:3003
```

This clicks the source languages page's links for German, Arabic, Traditional
Chinese and English in desktop/mobile light/dark variants. It checks that hover
does not change preferences, each explicit switch creates the root-scoped session
cookie, and an unprefixed revisit honors it despite an English browser language.
Ordinary links must not overwrite a preference selected elsewhere. Adapter unit
tests additionally cover router push/replace, prefetch suppression and SSR safety.

The edge checks confirm localized public HTML remains shareable across preference
cookies, without Set-Cookie or locale contamination, while unprefixed redirects
stay private. The runner performs local PURGE requests for the four about-page
test URLs to establish deterministic MISS/HIT assertions. Do not point this local
test runner at production. The test CSP proxy changes only the sandbox connect
origin. API and browser asset fixtures must cover the language-switch homepage
destinations, not only the languages/about pages. New API fixture misses fail the
runner; passing preference checks are not a full homepage content parity test.

## Packaged runtime environment and invalidation

Build Start with reserved `.test` public site/API origins and an explicit
production flag, then build its runtime image. Run Redis, the frozen API sandbox
on port 4101 and local Varnish on port 3003 before:

```sh
REDIS_URL=redis://127.0.0.1:16379 node scripts/benchmark/runtime.mjs \
  --output "$RESULTS" --image localhost/flathub-start:runtime-validation \
  --site https://staging.example.test \
  --public-api https://staging.example.test/api/v2
```

The runner owns a read-only container named `flathub-runtime-validation` on port
3001 and local API/purge fixtures on ports 4105/4104. These must be free. It checks
build-time public settings versus runtime-only internal API configuration, a
production robots wildcard policy, immutable hashed assets and credential bypass.
The production flag is exercised locally; it is not advice to make staging crawlable.
Build output under `.output` must correspond to the supplied image.

The packaged invalidation CLI is executed inside the container with a test-only
fetch preload mounted from the output directory. `purge-fixture.mjs` accepts only
an explicit loopback origin and prevents actual Fastly calls. A synthetic canary
app changes revision between requests. The mock verifies that every locale's
Redis generation has advanced before purging local Varnish, injects a purge failure,
then verifies a retry makes fresh canary content visible at the edge. Missing
release configuration or purge credentials must fail without mutation.

This is a local contract test, not a live publisher, Kubernetes or Fastly deployment
test. Do not use production Redis or image names. It performs local-only purge
requests, leaves the caller's Redis/Varnish/sandbox running and removes its own
container after checking its exit status. Results are written to `runtime.json`.
