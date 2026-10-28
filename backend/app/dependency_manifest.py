"""Manifest declarations, never an inventory of installed files."""

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any

PARSER_VERSION = 1
ARCH = "x86_64"
BRANCH = "stable"


@dataclass
class Declaration:
    pointer: str
    module_path: str
    name: str
    kind: str
    source_url: str | None = None
    evidence: dict[str, Any] = field(default_factory=dict)


def manifest_digest(manifest: dict[str, Any]) -> str:
    return hashlib.sha256(
        json.dumps(
            manifest, sort_keys=True, separators=(",", ":"), ensure_ascii=True
        ).encode()
    ).hexdigest()


def extract_declarations(
    manifest: dict[str, Any],
) -> tuple[list[Declaration], list[str]]:
    declarations: list[Declaration] = []
    diagnostics: list[str] = []

    def applicable(item: dict[str, Any], pointer: str) -> bool:
        for key in ("only-arches", "skip-arches"):
            value = item.get(key)
            if key in item and (
                not isinstance(value, list)
                or not all(isinstance(v, str) for v in value)
            ):
                diagnostics.append(f"{pointer}/{key}: invalid architecture restriction")
                return False
        if "disabled" in item and not isinstance(item["disabled"], bool):
            diagnostics.append(f"{pointer}/disabled: invalid condition")
            return False
        return not (
            item.get("disabled", False)
            or ("only-arches" in item and ARCH not in item["only-arches"])
            or ARCH in item.get("skip-arches", [])
        )

    def walk(modules: object, pointer: str, parents: tuple[str, ...], depth: int):
        if depth > 64:
            diagnostics.append(f"{pointer}: nesting limit exceeded")
            return
        if not isinstance(modules, list):
            diagnostics.append(f"{pointer}: invalid modules")
            return
        for index, module in enumerate(modules):
            location = f"{pointer}/{index}"
            if not isinstance(module, dict):
                diagnostics.append(f"{location}: unresolved include or invalid module")
                continue
            if not applicable(module, location):
                continue
            name = module.get("name")
            if not isinstance(name, str) or not name:
                diagnostics.append(f"{location}: missing module name")
                name = f"[{index}]"
            path = " / ".join((*parents, name))
            declarations.append(Declaration(location, path, name, "module"))
            sources = module.get("sources", [])
            if not isinstance(sources, list):
                diagnostics.append(f"{location}/sources: invalid sources")
                sources = []
            for source_index, source in enumerate(sources):
                source_pointer = f"{location}/sources/{source_index}"
                if not isinstance(source, dict):
                    diagnostics.append(
                        f"{source_pointer}: unresolved include or invalid source"
                    )
                    continue
                if not applicable(source, source_pointer):
                    continue
                kind = source.get("type")
                if not isinstance(kind, str) or kind not in {
                    "archive",
                    "git",
                    "bzr",
                    "svn",
                    "file",
                    "dir",
                    "script",
                    "shell",
                    "patch",
                    "extra-data",
                }:
                    diagnostics.append(f"{source_pointer}: unknown source type")
                    kind = "unknown"
                url = source.get("url")
                if url is not None and not isinstance(url, str):
                    diagnostics.append(f"{source_pointer}/url: invalid URL")
                    url = None
                evidence = {
                    key: value
                    for key, value in source.items()
                    if key
                    in {
                        "commit",
                        "tag",
                        "branch",
                        "sha256",
                        "sha512",
                        "sha1",
                        "md5",
                        "path",
                        "only-arches",
                        "skip-arches",
                    }
                }
                declarations.append(
                    Declaration(source_pointer, path, name, kind, url, evidence)
                )
            walk(
                module.get("modules", []),
                f"{location}/modules",
                (*parents, name),
                depth + 1,
            )

    if "modules" not in manifest:
        diagnostics.append("/modules: missing modules")
    walk(manifest.get("modules", []), "/modules", (), 0)
    return declarations, diagnostics
