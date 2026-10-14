# Maintenance Radar

The admin tool lives at `/admin/maintenance` and requires `quality-moderation`
on both the frontend and every API endpoint. Responses are private.

## Deployment

Apply the Alembic migration (`alembic upgrade head`) before deploying the API.
The new `maintenancetriage` table stores claims, shared notes, snooze reasons,
evidence fingerprints, and an optimistic version counter. No new worker or
external service is required.

## Evidence and ordering

- Package silence: configurable threshold, default 365 days. This is a reason
  to investigate, never a claim of abandonment.
- Runtime debt: the published runtime branch's stored EOL status, not an
  inferred support deadline. Unknown/malformed/missing runtimes remain unknown.
- Quality failures: explicitly failed, currently applicable guidelines. Unrated
  checks do not count as failures. Runtime checks are represented separately.
- EOL exposure: the published app branch is EOL and receives recent downloads.
- Missing update timestamps: unknown activity, not stale activity.

Cases sort by severity (runtime/EOL, stale/quality, unknown), then seven-day
download counts, then package age, with app ID as a deterministic tie-breaker.
Downloads are **not** unique users or active installations.

Runtime earthquake groups include snoozed apps so migration scope stays visible.
Opening a campaign shows its active runtime-debt queue. No future runtime sunset
dates are guessed from runtime version numbers or historical EOL timestamps.

Snoozes expire or become ineffective when package timestamp, runtime reference,
runtime EOL status, app EOL status, or failed guideline IDs change. Daily aging,
download counts, and filter thresholds do not invalidate a snooze. Cases whose
signals disappear leave the queue; investigation state remains available in the
detail API. Claims cannot be taken from another moderator. Concurrent edits
return 409 instead of overwriting notes or ownership.
Snooze requests must include `expected_fingerprint` from the viewed case. If
background ingestion changes that evidence while the editor is open, the API
returns 409 without hiding the new signals. Changes to download counts alone
do not invalidate the viewed fingerprint. Queue pages clamp to the final valid
page when snoozes or resolved signals shrink the result set.

The editor retains drafts across shared-version refreshes, including failed
refreshes after a conflict. A conflict shows the latest saved notes beside the
preserved draft; replacing the draft requires an explicit choice. Inputs are
locked while a save and its follow-up refresh are pending.

Upstream release comparison, build history, maintainer responsiveness, automated
outreach, and retirement are deliberately not implemented in this first version.

## Development checks

```sh
# Backend: pure tests run without a database; API tests use temporary tables.
MAINTENANCE_TEST_DATABASE_URL=postgresql+psycopg://... pytest tests/test_maintenance.py

# Frontend: regenerate only this client's module from the running backend.
pnpm exec orval --config orval.maintenance.config.ts
```

`MAINTENANCE_OPENAPI_URL` can point to a saved OpenAPI file. The separately
generated `frontend/src/codegen-maintenance` module does not overwrite unrelated
generated clients. Storybook's `Admin/Maintenance Radar` uses fictional evidence
and supports claim, notes, snooze, and wake interactions without backend access.
The delayed-save and conflict-refresh stories include browser interaction
regressions. The backend CI unit-test job provides PostgreSQL and sets
`MAINTENANCE_TEST_DATABASE_URL`, so the API and migration tests do not skip.
