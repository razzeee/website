from app.dependency_manifest import extract_declarations, manifest_digest


def test_numeric_provenance_duplicate_names_and_typed_revisions():
    manifest = {
        "modules": [
            {
                "name": "lib",
                "sources": [
                    {
                        "type": "git",
                        "url": "https://example.org/A",
                        "branch": "main",
                        "commit": "abc",
                    }
                ],
            },
            {
                "name": "lib",
                "modules": [
                    {"name": "lib", "sources": [{"type": "patch", "path": "fix.patch"}]}
                ],
            },
        ]
    }
    rows, issues = extract_declarations(manifest)
    assert not issues
    assert len({row.pointer for row in rows}) == len(rows)
    assert rows[1].evidence == {"branch": "main", "commit": "abc"}
    assert rows[-1].pointer == "/modules/1/modules/0/sources/0"
    assert rows[-1].kind == "patch"
    assert rows[1].source_url == "https://example.org/A"


def test_architecture_disabled_and_partial_coverage():
    rows, issues = extract_declarations(
        {
            "modules": [
                "include.yml",
                {"name": "arm", "only-arches": ["aarch64"]},
                {"name": "disabled", "disabled": True, "modules": [{"name": "hidden"}]},
                {
                    "name": "included",
                    "sources": [
                        "sources.json",
                        {"type": [], "url": 3},
                        {"type": "git", "skip-arches": ["x86_64"]},
                    ],
                },
                {"name": "bad", "only-arches": "x86_64"},
            ]
        }
    )
    assert [row.name for row in rows] == ["included", "included"]
    assert len(issues) == 5
    assert all("hidden" != row.name for row in rows)


def test_digest_is_order_independent_but_content_sensitive():
    assert manifest_digest({"a": 1, "b": 2}) == manifest_digest({"b": 2, "a": 1})
    assert manifest_digest({"a": 1}) != manifest_digest({"a": 2})


def test_null_architecture_restriction_is_partial_not_a_crash():
    rows, issues = extract_declarations(
        {"modules": [{"name": "unknown", "only-arches": None}]}
    )
    assert not rows
    assert issues == ["/modules/0/only-arches: invalid architecture restriction"]
