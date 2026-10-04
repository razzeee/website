# Backend Typing Improvement Implementation Plan

> **For agentic workers:** Implement this plan task-by-task, running the stated checks after each slice. Keep each task's changes focused and reviewable.

**Goal:** Strengthen Python typing across `backend/app` and enforce precise application-owned contracts with `ty`.

**Architecture:** Introduce/reuse shared recursive JSON types, then tighten boundary and internal contracts in dependency order: AppStream/API, search/cache, OIDC, persistence and integrations, then remaining modules. Validate untrusted values at ingestion; isolate unavoidable third-party dynamic interfaces in narrow, explained adapters.

**Tech Stack:** Python 3.13+, `ty`, Ruff, Pydantic, SQLAlchemy, pytest.

**Spec:** `docs/superpowers/specs/2026-10-04-backend-typing-design.md`

## Global Constraints

- Preserve runtime behavior; behavior changes are limited to validation needed to safely establish an intended type.
- Avoid replacing `Any` with `object`, broad unions, or loosely shaped dictionaries when a concrete contract can be modeled.
- Keep irreducible casts/dynamic types at narrow boundaries and locally explain why they are required.
- Keep `uv run ty check app` as the enforced backend entry point.
- Do not add blanket type-checker ignores.

## Review Focus

- **Malformed or unexpected external JSON:** confirm boundary validators reject or safely narrow invalid payloads without leaking weak types downstream. Pin with parser/validator tests in the owning slice.
- **Forward-compatible AppStream and content-rating fields:** ensure currently preserved unknown JSON-compatible fields remain representable. Add focused tests if the existing backend suite has no coverage for these payloads.
- **Legacy cache entries and tagged unions:** preserve deserialization fallback behavior and successful model reconstruction. Add focused cache serialization/deserialization tests if none exist.
- **Optional OIDC claims and token variants:** preserve exact optional-claim behavior for different scopes and refresh-token configurations. Pin with OIDC tests.
- **Untyped third-party interfaces (GI, Redis, Meilisearch, SQLAlchemy):** ensure adapters isolate dynamic types while callers remain precise. Pin with existing module tests plus the checker at each slice.

---

### Task 1: Inventory and establish typing guardrails

**Files:**
- Inspect: `backend/app/**/*.py`
- Modify: `backend/pyproject.toml`
- Verify: `backend/.pre-commit-config.yaml`

**Interfaces:**
- Produces: a module-grouped inventory of `Any`, unannotated public/internal boundaries, casts, ignores, and dynamic payload shapes to guide subsequent tasks.

- [ ] **Step 1: Record baseline diagnostics and tests**

Run from `backend/`:

```bash
uv run ty check app
uv run ruff check app
uv run pytest --ignore=tests/main.py --ignore=tests/test_storefront_smoke.py --ignore=tests/test_year_in_review_smoke.py
```

Expected: `ty` and Ruff pass; the suite establishes the starting behavior baseline.

- [ ] **Step 2: Inventory weak contracts**

Search application code for `Any`, untyped function definitions, `cast`, and `type: ignore`. Group findings by boundary and identify the `ty` rule settings currently available in the pinned environment. Record intentional external-library limitations alongside the relevant adapter.

- [ ] **Step 3: Set an incremental checker policy**

Update `[tool.ty]` in `backend/pyproject.toml` only with rules verified to exist in the current installed `ty`; do not enable broad strictness that floods the baseline with diagnostics. Keep `backend/.pre-commit-config.yaml`'s `uv run ty check app` invocation unchanged.

- [ ] **Step 4: Verify the guardrail**

Run `uv run ty check app` and `uv run ruff check app` from `backend/`.

Expected: both pass with the incremental configuration and no blanket ignores.

### Task 2: Define shared JSON and AppStream/API contracts

**Files:**
- Modify: `backend/app/types.py`
- Modify: `backend/app/api_models.py`
- Modify: `backend/app/utils.py`
- Test: `backend/tests/test_content_rating_types.py` if no existing backend test covers the utility contract

**Interfaces:**
- Produces: `JSONValue` recursive alias representing JSON null, booleans, numbers, strings, arrays, and string-keyed objects; use it for payloads that are truly arbitrary JSON.
- Produces: precise content-rating category and result shapes where the structure is fixed.

- [ ] **Step 1: Pin content-rating contract behavior**

Check existing backend coverage first. If none covers this utility, add `backend/tests/test_content_rating_types.py` for category IDs, levels, descriptions, and minimum-age fields before changing its result annotations.

- [ ] **Step 2: Define the recursive JSON alias**

In `backend/app/types.py`, define `JSONValue` as a recursive Python 3.13 type alias for JSON-compatible values; annotate no untrusted input as `JSONValue` until validation establishes JSON compatibility.

- [ ] **Step 3: Replace API payload `Any` with real shapes**

In `backend/app/api_models.py`, replace each `content_rating_details: dict[str, Any] | None` with the category/result model or `dict[str, JSONValue] | None` according to the actual AppStream contract. In `backend/app/utils.py`, use the same result shape for `categories`, `contentRatingResult`, and the overridden `Platform.model_dump` parameters/return, preserving the Pydantic signature as closely as the checker permits.

- [ ] **Step 4: Verify AppStream/API behavior and types**

Run the targeted content-rating and AppStream tests, then `uv run ty check app` and `uv run ruff check app` from `backend/`.

Expected: snapshots/API shape remain unchanged; the touched contracts no longer use unexplained `Any`.

### Task 3: Type Meilisearch documents and external result parsing

**Files:**
- Modify: `backend/app/search.py`
- Test: `backend/tests/test_search_typing_contracts.py` if no existing backend test covers these helpers

**Interfaces:**
- Consumes: `JSONValue` from Task 2 for values proven JSON-compatible.
- Produces: typed sanitizer input/output, translation payloads, and a narrow Meilisearch index protocol/adapter rather than `index: Any`.

- [ ] **Step 1: Pin sanitization and fallback behavior**

Check existing backend coverage first. If none covers translation sanitization, malformed index documents, and Meilisearch batch fallback, add `backend/tests/test_search_typing_contracts.py` for these cases, including a malformed nested JSON value.

- [ ] **Step 2: Type the boundary parsing helpers**

Replace `list[Any]` and `Any` sanitizer inputs with `object` or `JSONValue` at the correct boundary, then narrow values with runtime checks. Type sanitized documents as a string-keyed JSON mapping and preserve the existing error/result tuples.

- [ ] **Step 3: Isolate Meilisearch client typing**

Define the minimal `Protocol` for the index operations used by `_update_documents_with_fallback`, or a local adapter returning precise parsed results. Type public search results through existing Pydantic models, replacing the remaining untyped function signatures in this module where the inventory identified app-owned contracts.

- [ ] **Step 4: Verify search behavior and types**

Run targeted search/indexing tests, then `uv run ty check app` and `uv run ruff check app` from `backend/`.

### Task 4: Type cache serialization and deserialization boundaries

**Files:**
- Modify: `backend/app/cache.py`
- Test: `backend/tests/test_cache_typing_contracts.py` if no existing backend test covers these helpers

**Interfaces:**
- Consumes: `JSONValue` from Task 2 for serialized cache payloads.
- Produces: typed cache envelope and generic decorator signatures preserving a decorated async function's parameter and result types.

- [ ] **Step 1: Pin current cache behavior**

Check existing backend coverage first. If none covers cache hit, stale refresh, Pydantic model serialization, and legacy/malformed cache values, add `backend/tests/test_cache_typing_contracts.py` for those behaviors before changing the decoder.

- [ ] **Step 2: Model cache values and envelope**

Replace unparameterized `dict` and `Any` in serialization helpers with a typed JSON mapping/envelope. Treat Redis-decoded values as untrusted input and validate envelope fields before use.

- [ ] **Step 3: Preserve generic decorator typing**

Type callable/reflection helper inputs using `Callable`/`ParamSpec` and suitable protocols. Refine `_deserialize_value` so its dynamic output is validated against the return adapter/type before it reaches the decorator; remove the return-value ignore if the generic contract can express the behavior safely.

- [ ] **Step 4: Verify cache behavior and types**

Run targeted cache tests, then `uv run ty check app` and `uv run ruff check app` from `backend/`.

### Task 5: Type OIDC request, database, and protocol payloads

**Files:**
- Modify: `backend/app/oidc.py`
- Modify: `backend/app/routes/oidc.py`
- Test: `backend/tests/test_oidc.py`

**Interfaces:**
- Consumes: shared JSON types/models from Task 2.
- Produces: explicit types for OIDC key sets, JWT claims, token responses, optional userinfo claims, and database session usage.

- [ ] **Step 1: Pin OIDC response variants**

Run `backend/tests/test_oidc.py`. Ensure coverage distinguishes optional `refresh_token`, optional `id_token`, and scoped userinfo claims; add only missing assertions for these existing response variants.

- [ ] **Step 2: Replace loose OIDC response dictionaries**

In `backend/app/routes/oidc.py`, use `TypedDict` or Pydantic response models for token/JWKS/userinfo shapes and annotate route/helper signatures. Parse configured JWKS JSON as untrusted data and pass validated input to `joserfc` through the narrowest necessary adapter.

- [ ] **Step 3: Type OIDC persistence protocol**

In `backend/app/oidc.py`, replace `db: Any` with a minimal session/DB protocol and remove the `type(user)` cast if the SQLAlchemy model operation can be isolated behind a typed helper. Keep the public OIDC user protocol precise.

- [ ] **Step 4: Verify OIDC behavior and types**

Run `uv run pytest tests/test_oidc.py -v`, then `uv run ty check app` and `uv run ruff check app` from `backend/`.

### Task 6: Type summary ingestion and persistence payloads

**Files:**
- Modify: `backend/app/summary.py`
- Modify: `backend/app/models.py`
- Modify: `backend/app/database.py`
- Modify: `backend/app/stats.py`
- Test: relevant existing summary/stats/database tests; add `backend/tests/test_summary_typing_contracts.py` if no existing test covers the parsed payload contract

**Interfaces:**
- Consumes: shared JSON type and validated AppStream shapes from Task 2.
- Produces: explicit summary/ref/metadata result types and typed database JSON values for the paths touched.

- [ ] **Step 1: Pin summary parsing and database JSON behavior**

Run existing summary, stats, and database-related coverage. If none exercises parsed summary payloads, add `backend/tests/test_summary_typing_contracts.py` for valid summary data, invalid refs, optional metadata, and the JSON inputs whose narrowing changes.

- [ ] **Step 2: Type upstream GLib/OSTree payload handling**

In `backend/app/summary.py`, annotate parsing functions and internal dictionaries with concrete `TypedDict`/dataclass shapes. Treat `Variant.unpack()` output as untrusted/dynamic and validate the fields used before indexing. Keep GI stubs/ignores limited to imports or adapter calls that demonstrably lack typing.

- [ ] **Step 3: Type persisted JSON and query values**

In `backend/app/models.py`, type `App.appstream`, translated AppStream payloads, and moderation aggregate return structures using established models or JSON/domain types. In `database.py` and `stats.py`, narrow Redis/SQL-return values before JSON decoding instead of asserting `str | bytes` blindly.

- [ ] **Step 4: Verify summary/persistence behavior and types**

Run the targeted summary/stats/database tests, then `uv run ty check app` and `uv run ruff check app` from `backend/`.

### Task 7: Tighten remaining moderation, email, login, and worker contracts

**Files:**
- Modify: `backend/app/moderation.py`
- Modify: `backend/app/emails.py`
- Modify: `backend/app/logins.py`
- Modify: `backend/app/worker/redis.py`
- Modify: `backend/app/worker/refresh_github_repo_list.py`
- Modify: `backend/app/worker/update_app_picks.py`
- Modify: `backend/app/routes/quality_moderation.py`
- Modify: `backend/app/routes/purchases.py`
- Modify: any additional `backend/app` modules identified by Task 1
- Test: related tests under `backend/tests/`

**Interfaces:**
- Consumes: shared payload/domain types from earlier tasks.
- Produces: precise inputs and outputs for the remaining application-owned weak contracts and documented third-party adapters.

- [ ] **Step 1: Pin affected worker and moderation behavior**

Run audit-log, quality-moderation, email, Redis-worker, and relevant login tests. Preserve current payload fields and result ordering.

- [ ] **Step 2: Replace weak payload types**

In moderation/email/routes, use explicit `TypedDict`, dataclass, or Pydantic types for known data shapes; use recursive JSON types only where the payload is intentionally extensible. Replace untyped diagnostics with the concrete SDK type if available or a narrow local protocol.

- [ ] **Step 3: Remove avoidable casts and isolate library seams**

In logins/workers/quality routes, improve source annotations and use narrowing instead of `cast` where possible. For Redis/PyGithub/GI seams that lack usable stubs, contain casts in adapters with comments explaining the runtime guarantee.

- [ ] **Step 4: Verify remaining module behavior and types**

Run targeted affected tests, then `uv run ty check app` and `uv run ruff check app` from `backend/`.

### Task 8: Enforce the final typing standard and audit exceptions

**Files:**
- Modify: `backend/pyproject.toml`
- Modify: `backend/.pre-commit-config.yaml` only if needed to keep the existing check consistent
- Review: all `backend/app/**/*.py`

**Interfaces:**
- Consumes: typed module contracts from Tasks 2–7.
- Produces: a regression-enforcing `ty` configuration and a documented list of unavoidable boundary exceptions.

- [ ] **Step 1: Audit weak types and suppressions**

Search application code for `Any`, unparameterized `dict`/`list`, unannotated functions, `cast`, and `type: ignore`. For every remaining dynamic type or suppression, confirm it is localized to a boundary and explain why it cannot be replaced with a precise type.

- [ ] **Step 2: Strengthen `ty` checks**

Enable the applicable `ty` rules that enforce the agreed standard without blanket ignores. Keep diagnostics scoped to `app` and make sure the existing pre-commit hook uses the same command.

- [ ] **Step 3: Run complete backend verification**

Run from `backend/`:

```bash
uv run ty check app
uv run ruff check app
uv run ruff format --check app
uv run pytest --ignore=tests/main.py --ignore=tests/test_storefront_smoke.py --ignore=tests/test_year_in_review_smoke.py
```

Expected: all checks pass, API/database behavior is unchanged, and any remaining `Any`/casts/ignores have documented boundary reasons.
