# Backend typing improvement design

## Goal

Systematically strengthen Python typing across the backend so that application-owned contracts communicate concrete, useful types instead of relying on `Any` or similarly permissive annotations. The current `uv run ty check app` baseline passes; the goal is therefore stronger guarantees and clearer contracts, not merely a green checker.

## Scope

- Backend application code under `backend/app`, including routes, workers, data access, integrations, serialization, and shared models.
- Type annotations and models for dynamic payloads crossing application boundaries, especially JSON, API responses, cache values, and external service data.
- Typing seams around SQLAlchemy and third-party libraries where permissive inferred types currently leak into app-owned code.
- `ty` configuration and the backend's existing pre-commit check, strengthened after the relevant code is ready.

Tests, Alembic migration history, frontend, and backend-node are outside the initial scope except when changes are needed to validate a public backend contract.

## Design principles

1. **Prefer precise domain types.** Use concrete classes, `TypedDict`, discriminated unions, generics, protocols, and recursive JSON value aliases when each expresses the real contract more clearly than `Any`.
2. **Validate untrusted values at boundaries.** Treat decoded or externally supplied values as unknown (`object` or an equivalent untrusted type), validate/narrow them once, and pass typed values through the rest of the application.
3. **Contain irreducible dynamic interfaces.** Some framework or untyped-library interfaces may require a cast or dynamic type. Keep such escape hatches at the narrowest boundary, document why they are needed, and do not allow them to become app-level contracts.
4. **Do not substitute one weak type for another.** Avoid replacing `Any` with `object`, broad unions, or loosely shaped dictionaries where a concrete contract can be modeled. `object` is appropriate for unvalidated input, not as a blanket suppression.
5. **Preserve runtime behavior.** This is a typing and contract-clarification effort; behavior changes are limited to validation needed to safely establish an already intended type.

## Rollout

Work in dependency-aware slices rather than changing every module at once:

1. Inventory `Any`, casts, untyped parameters/returns, and dynamic mapping shapes. Establish representative type-check and test commands, and distinguish application-owned weakness from external-library limitations.
2. Define/reuse shared types for JSON values and recurring API/domain payloads. Add parsing or validation at external JSON and service boundaries where necessary.
3. Tighten internal contracts module by module, following shared types outward through routes, workers, persistence, caching, and integrations. Replace type-only casts with better source annotations or narrowings where feasible; retain documented boundary casts when required.
4. Tighten `ty` configuration incrementally to enforce the desired guarantees without broad suppressions. Keep the existing pre-commit `ty check app` hook as the enforced entry point.
5. Verify with `ty check app`, Ruff, and the backend test suite; inspect remaining `Any` and suppression sites and document the intentional boundary exceptions.

The inventory determines the exact ordering and which modules can be grouped safely. No blanket prohibition on every spelling of `Any` is assumed before external-library and framework boundaries are understood; the intended end state is no unexplained `Any` in application-owned contracts.

## Success criteria

- App-owned functions and models no longer expose unexplained `Any` in their inputs, outputs, or persistent payload contracts.
- Dynamic data is either represented by an explicit recursive JSON type or validated into a concrete application model before use.
- Remaining casts, ignores, and dynamic annotations are narrow, necessary, and locally explained.
- `ty` enforces the strengthened contract in the existing backend check, and Ruff plus backend tests pass.
- Runtime behavior and API/database semantics remain unchanged except for safe validation of malformed external inputs where required.

## Risks and mitigations

- **Third-party stubs may be incomplete.** Contain compatibility casts in small adapter functions and keep application-facing signatures precise.
- **JSON shapes may vary by provider or version.** Model known variants explicitly and validate at ingestion; preserve forward compatibility only where the current behavior requires it.
- **Broad strictness may create noisy diagnostics.** Increase enforcement in slices after fixing the underlying contracts rather than enabling every diagnostic at the outset.
- **Typing work may surface genuine edge cases.** Keep behavior changes small and add focused coverage when introducing new runtime validation.

## Open implementation detail

The inventory phase will determine the exact `ty` rules and shared type definitions. Select rules based on current `ty` capabilities and the errors they meaningfully prevent; do not add blanket ignores to meet the success criteria.
