# Appraise-assisted quality review

The moderator quality slide-over can request asynchronous Appraise analysis.
It is **off by default** (`QUALITY_ANALYSIS_ENABLED=false`). Scores never update
quality decisions, attribution, review requests, or app-pick eligibility.

## Storage and lifecycle

Analysis is ephemeral: job state, metadata, model identity, validated output, and
the analyzed PNG preview live in state Redis database 1 under `quality-analysis:`.
All expire one hour after the request, including queued or running jobs. A new
run replaces the previous result for that app. No analysis table or migration is
needed; PostgreSQL is only read for the catalog. Manual moderation decisions
continue to use the existing database storage.

Redis transactions deduplicate active runs per app, enforce five new runs per
moderator in a rolling minute and 100 active runs globally (configurable), and
allow only one worker to claim each job. Each admitted job is published once.
Failures are terminal; moderators can explicitly request a fresh run. There is
no recovery scheduler or durable history. A web process dying before publication,
a killed worker, or lost Redis state can lose the run; abandoned jobs expire
automatically. Late workers cannot recreate expired results. Redis persistence
and backups follow the deployment's existing state-Redis policy; TTL is not a
promise that data never reaches Redis disk snapshots.

Inference uses temporary metadata/icon files, removed when the CLI exits,
including failures and timeouts. The private icon preview remains in Redis only
for the job's remaining lifetime. Redis expiration does not require a scheduler.

Name, summary, branding, icon URL, and model/encoder/schema changes mark results
stale at read time, including changes made during inference. A deliberate new run
fetches icon bytes again even at an unchanged URL. The UI reports the last icon
verification time; it does not claim continuous byte freshness.

## Build and deploy

1. Keep the feature flag disabled while preparing the inference worker.
2. Build the normal backend image (`backend_backend:latest` by default).
3. Obtain the trusted `appraise-models-v0.2.2.tar.gz` release asset and verify the
   publisher's SHA256SUMS. Place it in `backend/appraise/` (gitignored).
4. Set `QUALITY_ANALYSIS_BUNDLE` to the archive's 64-character SHA256, and
   `QUALITY_ANALYSIS_ENCODER_REVISION` to the exact 40-character CLIP commit
   recorded in the icon model. No guessed values are supplied.
5. Build `backend/Dockerfile.appraise` with `MODEL_BUNDLE_SHA256` and
   `ENCODER_REVISION` build arguments. It clones the public `razzeee/appraise`
   repository without credentials and checks out Appraise v0.2.2 commit
   `de8f64e19bb16b45330ab374887e4389629e0eca`, installs its locked Python 3.12
   environment separately from the website environment, verifies the archive,
   prefetches the pinned encoder, and records a deployment manifest. Runtime
   invocation verifies the manifest identity and both model checksums.
6. Run the dedicated worker with one process/thread on `quality-analysis`.
   **Restrict ordinary workers to `--queues default slow`** so they cannot consume
   inference jobs. The Compose `appraise` profile implements this arrangement
   with an initial 4 GiB / 2 CPU limit. Production manifests must do the same.
7. Smoke-test the image with networking disabled using a known listing/icon:

   ```sh
   python -m utils.smoke_quality_analysis listing.json --icon icon.png
   ```

   Check scores against independently reviewed fixtures; record elapsed time and
   peak RSS on deployment hardware. Repeat for cold/warm filesystem caches and
   without an icon. Each CLI invocation loads its model anew. Only increase
   concurrency or consider a preloaded inference service after measuring.
8. Set the same bundle/encoder identity and `QUALITY_ANALYSIS_ENABLED=true` on
   web and inference worker deployments. For Compose,
   use `docker compose --profile appraise up --build` from `backend/`.

Inference sets Hugging Face and Transformers offline flags. Network access is
needed by the worker only to capture canonical repository icons. No model paths
or asset URLs are accepted through the HTTP interface. The CLI timeout defaults
to 180 seconds; its process group is killed on timeout. Download size is capped
at 16 MiB and PNG dimensions at 16 million pixels.

Rollback: disable the flag on every deployment. Existing moderation remains
available. Cached analyses expire automatically within an hour.

## API and verification

Moderator-only, no-store endpoints under `/quality-moderation/{app_id}`:

- `POST /analysis`: 202 status snapshot; returns the active run on duplicate calls.
- `GET /analysis`: latest status, explicit `not_requested`/`disabled`, result,
  snapshot, identity, and freshness information. After expiry, returns
  `not_requested`; reopening requires a new run. Catalog reads use the writer database.
- `GET /analysis/{analysis_id}/icon`: private immutable analyzed PNG.

The frontend polls only while its moderator slide-over is mounted and a run is
active, backing off to 15 seconds. The 12 learned criteria have no pass/fail
threshold or bulk-accept operation. Automatic rules remain in raw diagnostics
only. Storybook covers lifecycle, partial, stale, and request-failure states.

Run fixture tests without model downloads:

```sh
cd backend
QUALITY_ANALYSIS_TEST_REDIS_URL=redis://localhost:6379/15 \
  uv run pytest tests/test_quality_analysis.py
```

The Redis tests use an isolated key prefix and exercise concurrency, duplicate
delivery, expiry, late-worker fencing, explicit retries, freshness, private
snapshots, and admission limits. Catalog access is stubbed without a writable
database session.
Unit tests cover authentication, result validation, and the CLI contract.

Regenerate clients with the normal Orval workflow. `BACKEND_OPENAPI_URL` can
point to an exported local OpenAPI document for offline generation.

Release artifact access, the real-bundle smoke test, deployment-hardware latency
and memory measurements, and the moderator pilot evaluation remain operational
prerequisites; fixture tests cannot establish model usefulness or calibration.
