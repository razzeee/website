# Appraise deployment validation

## Scope

The feature stays disabled until the worker image and an offline inference run
have been validated. Local measurements are not a substitute for a check on the
production worker host. Model usefulness still requires a moderator pilot; these
checks establish the executable integration, not classifier accuracy.

## Pinned artifacts

- Appraise: v0.2.2, commit `de8f64e19bb16b45330ab374887e4389629e0eca`.
- Model archive SHA256:
  `5e9814e4604b5eff5c3ad2d2b1a5e940d46135b85ef56c5d3790757ae235551e`.
- CLIP encoder: `openai/clip-vit-base-patch32`, revision
  `3d74acf9a28c67741b2f4f2ea7635f0aaf6f0268`.
- `backend/appraise/release.env` records these values with the feature off.

The archive checksum was verified against the publisher's `SHA256SUMS`, and
all nine bundled artifacts were checked against `artifacts/model-manifest.json`.

## Local validation environment

Status (2026-11-06): the normal backend image build stopped while resolving
`feedgen==1.0.0` build dependencies because requests to
`https://pypi.org/simple/setuptools/` timed out. The dedicated worker image,
offline inference checks, and resource measurements have not run. Retry the
build commands below after package-index connectivity is restored.

- Linux, x86_64; AMD Ryzen 5 3600XT (6 cores / 12 threads).
- Rootless Podman; planned smoke-container limits: 2 CPUs and 4 GiB.
- Input: default-language `org.gnome.Calculator` metadata captured from Flathub,
  with its canonical 128px PNG and both branding colors.
- The validation commands use `--network=none`, a read-only root filesystem, and a writable
  temporary filesystem. Each run starts a new CLI process. Repeated runs may
  benefit from host filesystem caches; no claim of cold disk-cache timing is made.

## Reproduce on the deployment host

From `backend/`, after placing the verified release archive in `appraise/`:

```sh
set -a
. appraise/release.env
set +a
podman build -t localhost/website-appraise-backend:validation -f Dockerfile .
podman build -t localhost/website-appraise-worker:validation \
  -f Dockerfile.appraise \
  --build-arg BACKEND_IMAGE=localhost/website-appraise-backend:validation \
  --build-arg MODEL_BUNDLE_SHA256="$QUALITY_ANALYSIS_BUNDLE" \
  --build-arg ENCODER_REVISION="$QUALITY_ANALYSIS_ENCODER_REVISION" .
```

Capture an English/default listing JSON and its canonical PNG into a local
`fixtures/` directory. Run the smoke command with that directory mounted:

```sh
podman run --rm --network=none --read-only --tmpfs /tmp:rw,size=64m \
  --cpus=2 --memory=4g --env-file appraise/release.env \
  -v "$PWD/fixtures:/fixtures:ro,Z" \
  localhost/website-appraise-worker:validation \
  python -m utils.smoke_quality_analysis /fixtures/listing.json \
  --icon /fixtures/icon.png --expect-scored 12
```

Repeat in fresh containers, then omit `--icon` and use `--expect-scored 6` to
verify partial results. The CLI validates all known guideline IDs, finite scores,
and unavailable states; the smoke runner additionally checks the scored count
and prints artifact identity, input hashes, elapsed seconds, and child-process
peak RSS in KiB. Review both outputs and retain them with the deployment image
digest. The test fixture must have nonempty text and valid light/dark branding
to expect all twelve scores.

Before enabling the pilot, confirm that ordinary workers consume only `default`
and `slow`, and the dedicated worker consumes `quality-analysis` and shares state
Redis with the web service. No analysis migration or scheduler is required.
Apply the same bundle/encoder environment values to web and inference workers;
enable only after the deployment-host smoke test passes.
