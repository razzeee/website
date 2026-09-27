# Daily application permission statistics

## Purpose

Track how Flatpak permissions requested by listed applications change over time. In particular, make it possible to answer questions such as whether more apps request host filesystem access than last month. The first delivery is backend collection and a read API; no frontend chart is required.

## Population and source

- Count active, listed applications: `apps.type IN ('desktop-application', 'console-application')` and `apps.is_eol = false`. Count each app ID once, regardless of architectures. Exclude runtimes, add-ons, generic records, and end-of-life apps.
- Use the permissions parsed from the `stable` ref in the Flathub repository summary. A non-stable ref must never silently substitute for a missing stable ref. Prefer the existing primary repository summary's metadata; do not merge permissions across architectures or branches.
- The current `apps.summary` JSON stores only one branch and can be overwritten as refs are parsed. Capture the stable metadata explicitly while parsing the repository summary for this computation, without relying on the arbitrary last branch stored in `apps.summary` or changing the branch shown elsewhere on the site.
- Compute a snapshot after a successful repository-summary refresh and EOL reconciliation, against the refreshed app catalog. A failed or unavailable repository summary must not produce a snapshot. Do not make download-statistics updates responsible for permission snapshots.

## Counting contract

- One app contributes at most one count to each distinct permission value per snapshot. Store exact values rather than collapse modes or read-only qualifiers; for example, `filesystems/host` and `filesystems/host:ro` remain separate. A consumer can group relevant values to visualize host access.
- For Context permissions, count by context key and value (`shared`, `sockets`, `devices`, `filesystems`, and any other parsed keys). For bus policies, count by bus (`session-bus` or `system-bus`), policy level (such as `talk` or `own`), and bus name. Preserve unfamiliar keys and values without inventing interpretations.
- Include `eligible_apps` (the population size) and `apps_with_stable_metadata` (apps with successfully parsed stable metadata) in every snapshot. Missing or unparseable stable metadata does not mean an app has zero permissions; coverage is visible separately. An app with valid metadata and an empty permission map is covered and contributes zero permission counts.

## Persistence and schedule

- Persist one aggregate snapshot per UTC calendar date in Postgres, with a unique date and the counts and coverage figures. An update on the same date replaces that date's snapshot atomically rather than duplicating or incrementally adding counts. Snapshots for earlier dates are not overwritten by later updates.
- Generate the snapshot as part of the existing catalog update worker after summary ingestion, with a date taken when the refreshed data is counted. The computation should use the stable metadata from that same successful ingestion. Keep the snapshot write transactional so failures do not publish a partial count.
- Start history on the first successful run. Existing current-state summaries cannot reconstruct previous daily permission counts; there is no historical backfill in this delivery. If no catalog update succeeds on a date, that date has no snapshot, rather than a synthetic zero.
- This is aggregate history, not per-app permission history. It supports counts and trends but cannot later identify exactly which app changed on a past date.

## API

- Add `GET /stats/permissions` with optional inclusive `start_date` and `end_date` query parameters. Reject an inverted range. Return snapshots ordered by date ascending; return an empty list before the first snapshot or for a range without data.
- Each item contains an ISO date, `eligible_apps`, `apps_with_stable_metadata`, and nested permission counts, with bus policy levels retained. Counts are numbers of apps, not numbers of declarations or downloads.
- Keep this endpoint's response model and retrieval code separate from the existing download-oriented `GET /stats/` and `GET /stats/{app_id}`. Register the literal path so it cannot be confused with the app-ID route. No frontend changes are in scope.

## Validation

- Tests cover selecting `stable` in the presence of another branch, excluding apps without usable stable metadata from permission counts while reporting coverage, counting each distinct exact value once per app, distinguishing bus policy levels, and excluding ineligible/EOL apps.
- Tests cover same-day replacement, no snapshot on summary-refresh failure, range filtering and ascending API order, and the empty-history response.
- Run the backend's relevant test and lint checks. A migration accompanies the new Postgres snapshot model.
