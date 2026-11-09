"""Stored checker observations, without inferring coverage from missing reports."""

from collections import deque
from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field, JsonValue


class CheckerError(BaseModel):
    type: str
    message: str
    branch: str | None = None


class CheckerSource(BaseModel):
    manifest: str
    source_pointer: str
    module: str | None = None
    type: str | None = None
    checker_type: str | None = None
    checkers_run: list[str] = Field(default_factory=list)
    status: Literal["unchecked", "failed", "update_available", "blocked", "checked"]
    reason: str | None = None
    state: str | None = None
    current: JsonValue = None
    candidate: JsonValue = None
    selected_version: str | None = None
    update_group: JsonValue = None
    errors: list[CheckerError] = Field(default_factory=list)
    branch: str | None = None


class CheckerBranch(BaseModel):
    branch: str | None = None
    status: str
    delivery: str | None = None
    sources: list[CheckerSource] = Field(default_factory=list)
    errors: list[CheckerError] = Field(default_factory=list)


class CheckerReport(CheckerBranch):
    schema_version: Literal[1]
    manifest: str
    started_at: datetime
    finished_at: datetime
    mode: str
    branches: list[CheckerBranch] = Field(default_factory=list)


class CheckerSourceHealth(BaseModel):
    branch: str | None
    source: CheckerSource
    observed_at: datetime
    run_url: str
    failures: int = 0
    first_failure_at: datetime | None = None
    last_failure_at: datetime | None = None
    last_failure_run_url: str | None = None
    failure_errors: list[CheckerError] = Field(default_factory=list)
    recovered_at: datetime | None = None


class CheckerRun(BaseModel):
    observed_at: datetime
    run_url: str
    status: str
    delivery: str | None
    branches: list[CheckerBranch]


class CheckerDiagnostic(BaseModel):
    branch: str | None
    error: CheckerError
    observations: int = 0
    first_seen_at: datetime
    last_seen_at: datetime
    run_url: str


class CheckerHealth(BaseModel):
    last_report_at: datetime | None = None
    last_check_at: datetime | None = None
    sources: list[CheckerSourceHealth] = Field(default_factory=list)
    history: list[CheckerRun] = Field(default_factory=list)
    diagnostics: list[CheckerDiagnostic] = Field(default_factory=list)


def utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        raise ValueError("Checker timestamps must include a timezone")
    return value.astimezone(UTC)


def source_identity(
    branch: str | None, source: CheckerSource
) -> tuple[str | None, ...]:
    return (
        branch or source.branch,
        source.manifest,
        source.source_pointer,
        source.module,
        source.type,
        source.checker_type,
    )


def report_branches(report: CheckerReport) -> list[CheckerBranch]:
    # The aggregate's sources and errors repeat the per-branch evidence.
    if report.branches:
        branches = list(report.branches)
        errors = {(b.branch, e.type, e.message) for b in branches for e in b.errors}
        extra_errors = [
            e for e in report.errors if (e.branch, e.type, e.message) not in errors
        ]
        if extra_errors:
            branches.append(
                CheckerBranch(
                    status=report.status, delivery=report.delivery, errors=extra_errors
                )
            )
        return branches
    return [CheckerBranch.model_validate(report.model_dump())]


def summarize(observations, *, ordered: bool = False) -> CheckerHealth:
    result = CheckerHealth()
    sources: dict[tuple[str | None, ...], CheckerSourceHealth] = {}
    diagnostics: dict[tuple[str | None, ...], CheckerDiagnostic] = {}
    history: deque[CheckerRun] = deque(maxlen=20)
    if not ordered:
        observations = sorted(
            observations, key=lambda row: (row.observed_at, row.artifact_id)
        )
    for row in observations:
        report = CheckerReport.model_validate(row.report)
        at = utc(report.finished_at)
        run_url = f"https://github.com/flathub/flathub/actions/runs/{row.run_id}/attempts/{row.run_attempt}"
        branches = report_branches(report)
        result.last_report_at = at
        history.append(
            CheckerRun(
                observed_at=at,
                run_url=run_url,
                status=report.status,
                delivery=report.delivery,
                branches=[
                    branch.model_copy(update={"sources": []}) for branch in branches
                ],
            )
        )
        seen = set()
        for branch in branches:
            for error in {
                (e.branch, e.type, e.message): e for e in branch.errors
            }.values():
                key = (branch.branch or error.branch, error.type, error.message)
                diagnostic = diagnostics.get(key)
                if diagnostic is None:
                    diagnostic = CheckerDiagnostic(
                        branch=branch.branch or error.branch,
                        error=error,
                        first_seen_at=at,
                        last_seen_at=at,
                        run_url=run_url,
                    )
                    diagnostics[key] = diagnostic
                diagnostic.observations += 1
                diagnostic.last_seen_at = at
                diagnostic.run_url = run_url
            if report.status == "skipped" or branch.status == "skipped":
                continue
            for source in branch.sources:
                branch_name = branch.branch or source.branch
                key = source_identity(branch.branch, source)
                if key in seen:
                    raise ValueError("Duplicate checker source location")
                seen.add(key)
                state = sources.get(key)
                if state is None:
                    state = CheckerSourceHealth(
                        branch=branch_name,
                        source=source,
                        observed_at=at,
                        run_url=run_url,
                    )
                    sources[key] = state
                state.source = source
                state.observed_at = at
                state.run_url = run_url
                if source.checkers_run:
                    result.last_check_at = at
                if source.status == "failed":
                    state.failures += 1
                    state.first_failure_at = state.first_failure_at or at
                    state.last_failure_at = at
                    state.last_failure_run_url = run_url
                    state.failure_errors = source.errors
                    state.recovered_at = None
                elif (
                    source.status in ("checked", "update_available")
                    and not source.errors
                ):
                    if state.failures:
                        state.recovered_at = at
                    state.failures = 0
                    state.first_failure_at = None
                # Unchecked, blocked and absent sources cannot clear failures.
    result.sources = sorted(
        sources.values(),
        key=lambda s: (
            not bool(s.failures),
            s.branch or "",
            s.source.manifest,
            s.source.source_pointer,
        ),
    )
    result.history = list(reversed(history))
    result.diagnostics = sorted(
        diagnostics.values(), key=lambda d: d.last_seen_at, reverse=True
    )
    return result
