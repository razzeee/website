# External research: manifest dependency search

Checked **2026-10-28**, using GitHub's API and source archives pinned to the revisions below, plus the current website checkout. No generators or scanners were run, and production endpoint coverage was not measured. The implementation proposal below is for discussion, not an approved specification.

## Conclusion

The inspected tools provide useful **manifest extraction, declaration provenance, and build metadata**, but no ready-to-consume cross-app dependency index/search service or published all-Flathub SBOM corpus was found in this scope. `razzeee/flatpak-sbom` is a per-app CLI producing manifest-derived CycloneDX, not a shipped-file inventory or a search backend. A bounded declaration index can reuse its vocabulary and extraction cases without making SBOM generation a prerequisite. See [SBOM README][sbom-readme], [CLI][sbom-cli], and the repository survey below.

The most defensible result wording is **“declares this source/module in the manifest associated with this app ref and commit.”** Neither a module name nor a declared source proves that a library is present in the installed app. Flatpak Builder explicitly performs cleanup; archives, vendored code, binary payloads, and runtime/extension dependencies have different coverage. [Builder export semantics][builder-doc], [SBOM scope][sbom-readme].

## Discovery and checked revisions

Discovery used `gh api --paginate 'orgs/flathub-infra/repos?per_page=100'` ([first-party organization API][org-api]). It returned 40 repositories. Relevant active repositories included `vorarbeiter`, `flat-manager-hooks`, `flatpak-builder`, `flatpak-external-data-checker`, `flatpak-builder-lint`, `flathub-repro-checker`, `documentation`, and `website`. The last is intentionally outside this external-source investigation. Repository metadata marked historical `buildbot-config`, `buildbot-flathub`, `backend`, `meta-flatpak`, `summary-files`, and `flathub-inactive-repo-list` archived; discovery is not evidence that their historical data is available or current. Other org repos mainly concern website assets, statistics, packaging, authentication, or administration.

| Repository | Checked default-branch revision | Commit date (UTC) |
| --- | --- | --- |
| [razzeee/flatpak-sbom](https://github.com/razzeee/flatpak-sbom) | `0993aa5bcf1b6b9c9ca7b7052cb5f3a619f74625` | 2026-07-15 |
| [flathub-infra/vorarbeiter](https://github.com/flathub-infra/vorarbeiter) | `1ed808f82163776d1fdb407904f18b8930f7bdcd` | 2026-10-28 |
| [flathub-infra/flat-manager-hooks](https://github.com/flathub-infra/flat-manager-hooks) | `5fed04052e89d152b119a4fd4270d9ec88b1f426` | 2026-06-11 |
| [flathub-infra/flatpak-builder](https://github.com/flathub-infra/flatpak-builder) | `48933348c14a5d818783d3ef84b159641cfc59fa` | 2026-06-15 |
| [flathub-infra/flatpak-external-data-checker](https://github.com/flathub-infra/flatpak-external-data-checker) | `eb885e1bcb15644066573888127a381a54466155` | 2026-06-14 |
| [flathub-infra/flatpak-builder-lint](https://github.com/flathub-infra/flatpak-builder-lint) | `d2597baa5f9108bbb5eec5082bc636e6a04ee5d9` | 2026-10-27 |
| [flathub-infra/flathub-repro-checker](https://github.com/flathub-infra/flathub-repro-checker) | `94f645291720f858ebf272c62a43282464b01487` | 2026-06-23 |
| [flathub-infra/documentation](https://github.com/flathub-infra/documentation) | `81047075e2675d68beeeb152df5dd012d24a54c3` | 2026-10-26 |
| [flathub/flathub](https://github.com/flathub/flathub), followed from FEDC docs | `deefa1aaf2d9aaf633a3c19f52b28132318cf386` | 2026-10-28 |

## 1. `flatpak-sbom`: useful extraction and provenance, not an index

### Inputs and output schema

The CLI accepts an app ref such as `app/org.example.App/x86_64/stable`, with a configurable repository defaulting to `https://dl.flathub.org/repo`. Commands are `generate`, `scan`, and `report`. Generation writes JSON to a file or stdout; there is no list-all-apps, ingestion service, or dependency-search command. [README][sbom-readme], [CLI][sbom-cli].

[Generation code][sbom-generation] reads app metadata and `files/manifest.json`, resolves the runtime declared in metadata (with a manifest fallback), and reads runtime metadata and a manifest from `files/manifest.json` or `usr/manifest.json`. Its JSON contains:

- CycloneDX `bomFormat`, `specVersion: "1.7"`, random `serialNumber`, document `version: 1`.
- `metadata.timestamp`, build lifecycle, generator name/version, and root app component.
- `components`: app artifact, runtime artifact, recursive module components, and source components.
- `dependencies`: root → app/runtime artifacts → modules → nested modules/sources. This encodes declaration structure, not an observed linker or runtime dependency graph.
- `compositions` with `aggregate: "incomplete"`, coverage `app-and-runtime-manifests`, and an explicit limitation on archive, vendored-tree, and binary extra-data contents.

Component properties include `flatpak:scope`, repository URL, Flatpak ref, OSTree commit, manifest path, module, source type, URLs, local paths, checksums, git commit/tag/branch, and extra-data size/destination details. Module components carry `flatpak:manifest-module-path`; source `bom-ref` encodes the module path and source index. Arbitrary manifest/module/source properties are retained under prefixed properties. Source checksums are also emitted as CycloneDX hashes. Identity evidence includes method text and hard-coded confidence values; those numbers should not become a backend's calibrated confidence score. [Component construction and identity logic][sbom-components].

### Conservative identity reuse

[The inference functions][sbom-identity] recognize GitHub git/release/archive URLs, Python-hosted wheels, Cargo crate filenames, NuGet flat-container URLs, and Go proxy zip URLs. Strong reuse opportunities are their fixtures, explicit ecosystem-specific cases, and distinction between raw source evidence and an inferred package URL. Module names have no purl and are weak identity evidence.

Do **not** copy all inference rules unchanged into canonical search identities:

- Cargo inference also accepts any URL containing `/crates/`, not just the official host. Treat that as heuristic rather than authoritative ecosystem identity.
- Generic source component `version` is tag, commit, or branch; a branch is not a release version. Archive-derived versions can appear in the purl without a corresponding component `version`.
- GitHub purls identify repositories; they do not prove equivalence to a same-named npm, PyPI, or distro package. Git revisions and release versions are distinct evidence.
- Current routines construct purl strings directly. Validate ecosystem naming/encoding before using these as canonical keys.
- Module paths are assembled from names. For precise declaration locations, retain numeric JSON pointers/source indexes as well, since duplicate sibling names can collide.

For an initial index, keep raw names and URLs; use a separate text-search normalization only for matching. Merge identities only with explicit typed evidence (e.g. verified repository identity or recognized registry coordinates); do not collapse punctuation, arbitrary hosts, filename stems, module names, and package ecosystems into one global identity. These are research recommendations based on the implementation above, not behavior promised by upstream.

### Availability and correctness caveats

- Missing/unparseable app **or runtime** manifests can fail the entire generation. A bounded app-declaration index should be able to record app success and runtime unavailable separately. [Generation][sbom-generation].
- Runtime resolution observes the runtime ref at generation time; it does not establish the runtime commit originally used to build the app or installed by a particular user. Extension groups are counted as unresolved, not inventoried. [Generation][sbom-generation].
- Module/source `only-arches` and `skip-arches` are supported. String-valued module includes become name-only modules with no sources/children, rather than being resolved. The source model expects source objects. Preserve explicit partial-coverage/include diagnostics if borrowing this parser. [Manifest types][sbom-manifest].
- The OSTree reader resolves a ref and subsequently pulls/reads by that moving ref again. A ref change can therefore make the recorded commit disagree with later content. `resolve_ref` pulls without a subpath, while file reads use `--subpath`; do not assume this CLI is a minimal-transfer, commit-pinned ingestion layer. A backend should resolve once and read by immutable commit. [OSTree implementation][sbom-ostree].
- The only checked GitHub workflow runs formatting, clippy, and tests. The releases API returned `[]` on the checked date. No hosted SBOM publication endpoint or scheduled full-catalog corpus was found here; these observations do not prove that nobody runs the CLI privately. [CI][sbom-ci], [releases API][sbom-releases].
- `scan --scanner grype` uses a temporary CycloneDX 1.6 document for compatibility, rather than the generator's default 1.7. Vulnerability findings over these declarations still are not proof of installed vulnerable content. [README][sbom-readme].

## 2. Existing manifest collection and source-file provenance

### Flatpak Builder and published manifests

Builder documents that exported apps carry a resolved `/app/manifest.json`, including actual git commits in place of branch names. The source writes `files/manifest.json` for apps and `usr/manifest.json` for runtimes. Official Flathub docs describe `/app/manifest.json` and `/usr/manifest.json` as ways to find sources. This is strong evidence for indexing declarations tied to published artifacts instead of GitHub default-branch HEAD. [Builder documentation][builder-doc], [writer][builder-writer], [Flathub finding-sources guide][finding-sources].

A resolved manifest is a precise build-associated document, but it is not necessarily the original YAML/JSON file with original line numbers. Store its OSTree repository/ref/commit/path and declaration pointer. A GitHub link requires a separately established source repository, **git** revision, and actual manifest/include filename; the OSTree commit is not a Git commit. Never manufacture `blob/<ostree-sha>/...` or present a default-branch link as immutable evidence.

### Flatpak External Data Checker (FEDC)

FEDC extracts external sources, checks availability and newer versions, and can update manifests/open PRs. Its README documents the hosted default-branch-only scope, opt-outs, and installation-time extra-data downloads. It does not advertise a persisted dependency inventory or reverse-dependency API. [README][fedc-readme].

Concrete reusable parsing/provenance patterns:

- `ManifestChecker` maintains a file→parsed-content map, recursively follows external module files, walks child modules, and follows sources from external files. It preserves the file associated with each item rather than only flattening declarations. [Manifest loader][fedc-manifest].
- `BuilderModule` stores `name`, raw `module`, `module_path`, `parent`, and sources. `BuilderSource` stores raw `source`, `source_path`, filename, arches, checker data, and module. These are Python objects, not a promised public JSON export schema. Their provenance shape is useful if original source-file links are required later. [Data model][fedc-model].
- `x-checker-data` describes update discovery and optional source relationships; it is not a universal package identity standard. Do not require it for dependency indexing. [README][fedc-readme], [model][fedc-model].

Following FEDC's documentation revealed an actual cross-repository collector in **`flathub/flathub`**, not `flathub-infra`: the [action entrypoint][fedc-action] enumerates public, unarchived Flathub repos, excludes inactive repos, shards ordinary repos across six runs, and uses GitHub code search to prioritize extra-data repos. It shallow-clones repos and chooses `<repo>.yml`, `.yaml`, or `.json`, then runs update checks. It filters for extra-data, checker metadata, or AppImage references and respects opt-outs/EOL configuration. **This is collection/update automation, not a complete searchable inventory.** The script explicitly notes GitHub code search's incomplete index and checks its 1,000-result ceiling. Reuse enumeration/sharding lessons, not the filtered app set as inventory coverage.

### Flatpak Builder Lint

The [manifest helper][lint-manifest] recursively collects module include filenames with a visited set, validates YAML/JSON, and calls `flatpak-builder --show-manifest` to handle external modules and JSON-GLib syntax. The returned mapping adds diagnostics such as `x-manifest-filename`, unknown properties, parse warnings, and flathub configuration. These are useful parsing/diagnostic patterns, not a dependency database. Its key-line helper searches for a key and is not a precise nested declaration locator; do not use it to claim exact per-source line provenance.

## 3. Build metadata and publication integration

### Vorarbeiter

[Pipeline response schemas][pipeline-schema] expose app ID, status, repository, build/publish job IDs, log URL, and lifecycle timestamps. Summaries additionally contain `source_repo`, `sha`, and publication time; full responses contain `params`. These are useful evidence for mapping published work to a source revision, provided the exact published build/ref is matched. A latest successful/test pipeline is insufficient evidence for the current published artifact. This research checked source schemas, not deployment permissions, retention, or an exhaustive live API response.

The [build recipes][build-recipes] choose the manifest, run Flatpak Builder, use `--bundle-sources` for x86_64, and inspect the resolved manifest for extra-data. Source-cache recipes call `--show-manifest`, extract checksums recursively, and enumerate git source URLs/revisions. Reuse opportunities: immutable build provenance, source cache conventions, and later publish-triggered refreshes. No cross-app component search or SBOM generation/publication step was found in the inspected build workflow/recipes.

### Flat-manager hooks

The [hook README][hooks-readme] describes `publish` updating AppStream/commit subsets/token type, and `review` performing validation and backend moderation checks. These are existing build/publish integration points, not an SBOM catalog. Publication can edit build commits, so distinguish pre-publication build provenance from final repository commit provenance. Any future inventory hook should record the final artifact identity rather than assume an upload-stage commit is final.

### Reproducibility checker

The [repro checker][repro-readme] rebuilds apps and compares files with diffoscope; it can upload result ZIPs to S3. Its documented JSON schema contains string-valued `timestamp`, `appid`, `status_code`, `log_url`, `result_url`, and `message`. It documents x86_64/stable app-only support. This is published reproducibility evidence, not an SBOM or cross-app dependency inventory; useful provenance/report-link conventions should not be confused with component coverage.

## 4. Evidence contract suggested by the external sources

This is a minimal research-derived **data contract**, not a local model/migration proposal:

| Evidence | Preserve |
| --- | --- |
| Snapshot | remote URL, full Flatpak ref (kind/app ID/arch/branch), resolved OSTree commit, fetch time, parser version, manifest path/content digest |
| Declaration | module name and numeric nesting pointer, source index/pointer, raw source type/URL/path, checksums, git commit/tag/branch, arch predicates |
| Search match | matched raw field, match kind (module text/source URL/typed identity), separate normalized key and normalization rule version |
| Optional source-repo provenance | repository URL, Git commit, root/include file path; exact lines only if actually mapped |
| Coverage | app/runtime scope, success/missing/error/partial state, unresolved includes/extensions, stale last-success timestamp |

Keep app-bundled declarations distinct from runtime declarations; a runtime's current source inventory should not be silently attached as if declared in every app's own manifest. Retain all source kinds as evidence but avoid calling patches, local files, shell actions, or build-only modules shipped libraries. Empty results must mean **“no matching declarations in successfully indexed coverage”**, not “the app does not contain this dependency.” [SBOM composition and scopes][sbom-generation], [manifest source model][sbom-manifest], [Builder lifecycle][builder-doc].

For precise links, the robust baseline is a retained resolved-manifest document identified by immutable snapshot plus JSON pointer. GitHub immutable blob links can supplement this once source-revision/file provenance is established. None of the examined tooling supplies a complete general mapping from resolved manifest JSON pointers back to original included YAML/JSON line ranges.

## 5. Local integration and proposed first implementation

**Implementation follow-up:** The user approved declarations, stable x86_64,
and immutable resolved-manifest links. The first slice now lives in
`app/dependency_index.py`, `app/dependency_manifest.py`, `app/routes/dependencies.py`,
and the website's `/dependencies` pages. See [operational instructions](README.md#manifest-dependency-index).
An isolated live pilot on 2026-10-28 indexed GNOME Calculator and Text Editor:
two complete manifest snapshots, ten declarations, 3,185 serialized JSON bytes,
approximately 1.82 seconds including ref enumeration. These two small apps do not
establish full-catalog transfer, storage, or query performance. Full collection
defaults off pending rollout measurements; snapshots are retained without pruning.
The proposal below records the design rationale; module search currently uses
name-prefix matching, and PostgreSQL tests exercise the migration and lifecycle.

### Existing infrastructure

- [`app/moderation/ostree_manifest.py`](app/moderation/ostree_manifest.py) already selectively pulls `/files/manifest.json`, overrides ref resolution with commit IDs, checks resolved commits, handles timeouts/missing/invalid documents, and walks nested module/source declarations. Extract a small shared manifest-reader interface for a published-ref reader; retain the moderation caller's existing behavior and tests. The existing pair collector is designed for candidate-versus-published comparisons, not a catalog backfill.
- [`ManifestAnalysisObservation`](app/models.py) stores build-associated collection coverage and source-change findings. It is neither a full inventory nor proof that a candidate was published; do not backfill the index from these observations.
- [`app/moderation/url_origin.py`](app/moderation/url_origin.py) normalizes ordinary source URLs to origins, with repository handling for selected forges. That policy-specific key is too coarse for dependency identity.
- [`app/summary.py`](app/summary.py) already reads repository summaries and validates refs, but its app-level aggregation is not an immutable per-architecture inventory. Preserve full refs and checksums before aggregation, or enumerate refs with the shared OSTree reader.
- Existing Dramatiq actors and scheduling in [`app/worker/`](app/worker/), PostgreSQL/SQLAlchemy models and Alembic migrations, FastAPI routes, and generated frontend API client are sufficient integration infrastructure. [`app/search_index.py`](app/search_index.py) configures app-discovery search, not dependency search. No SBOM ingestion was found in the inspected checkout.

### Recommended boundary

Build **manifest dependency search** inside this backend, with a small website search page. Initial coverage: published stable x86_64 app refs associated with catalog apps. Display that scope explicitly, including exclusions and missing manifests. Add other architectures after measuring the first backfill; architecture-independent claims are out of scope for this first slice.

The question answered is: **“Which indexed apps declare this module or source?”** Results must not claim “verified bundled” or “installed.” Runtime inventories, extension contents, archive/vendor inspection, vulnerability matching, shared-patch analysis, and original YAML line mapping are later work.

### Storage and ingestion

Use three small models, with names provisional:

1. `DependencyRefState`: repository/full ref, observed current commit, current successful snapshot, last attempt/success timestamps, and collection status/error. A failed refresh preserves previous evidence but marks it stale; it must not relabel the previous snapshot as the current commit. Remove withdrawn refs from default results only after successful complete enumeration.
2. `DependencyManifestSnapshot`: repository/full ref/OSTree commit/parser version identity, retained manifest JSON and digest, manifest path, coverage diagnostics. Immutable snapshots make links reproducible; retain snapshots referenced by published links in this first version and measure storage before setting a later retention policy.
3. `DependencyDeclaration`: snapshot, numeric JSON pointer, human module path, declaration kind, raw name/source fields, tag/branch/commit/checksums, architecture restrictions, and separate search fields. Module rows remain searchable even without external sources. Patch/file/extra-data sources remain explicitly typed; they are not silently classified as libraries.

A scheduled Dramatiq actor enumerates published refs and queues bounded per-ref work only for changed commits or parser versions. Resolve once, read the immutable commit, extract without executing manifests, and transactionally publish the snapshot plus declaration rows. Missing documents, unsupported structures, and unresolved includes have explicit coverage states; one failed app cannot abort the catalog refresh. Apply module/source architecture restrictions and disabled-module behavior explicitly, with unknown conditions recorded as partial coverage.

### Search and links

- Start with PostgreSQL, using indexed module-name token/prefix matching and exact source-URL matching, paginated with deterministic ordering. Use query-plan measurements from the backfill to decide whether a dedicated index in the existing Meilisearch deployment is warranted. A separate service is not justified by the inspected requirements.
- Preserve raw names and full URLs. Case-fold name search fields only; do not collapse punctuation or merge same-named modules into canonical packages. Preserve URL paths/case/query semantics. Typed ecosystem identities can be added later through explicit, tested rules.
- Display exact git tag, commit, or branch with its type. Unknown release version stays unknown; do not promote filename guesses or branch names into versions. V1 searches names and source URLs; semantic version-range search is deferred.
- Proposed API: `GET /dependencies?q=...&match=module|source&cursor=...`, plus an immutable snapshot endpoint. Return app identity, matched field, declaration kind, revision evidence, full ref/commit, timestamps, coverage status, snapshot link, and numeric declaration pointer.
- The website page links each match to a retained manifest view that highlights the declaration by numeric JSON pointer. That is the precise manifest link for V1. External source URLs are additional links. Original GitHub blob links appear only when the source Git commit and actual root/include file have been established; OSTree and Git commit IDs are never interchangeable.
- Show coverage totals and stale/partial status. Empty results mean no match within indexed coverage, not absence of the dependency from Flathub.

### Bounded delivery and validation

One vertical slice includes migrations, the shared published-manifest reader, extractor, scheduled incremental ingestion, paginated API, search page, and immutable manifest view. First exercise ingestion against a small explicit app list, then backfill the agreed scope. Record elapsed time, network/storage use, and complete/partial/missing/error counts before enabling the full scheduled job.

Meaningful fixtures should cover nested and duplicate module names, multiple sources, architecture exclusions, unresolved includes, missing manifests, version-versus-revision labeling, and unrelated projects sharing a source host. Integration tests should verify commit/content consistency during a moving-ref update, idempotency, failed-refresh preservation, transactionality, and withdrawal handling after failed versus successful enumeration. API/UI checks should verify stable pagination, exact declaration links, and visible scope/coverage labels. No implementation or runtime tests were performed during this research task.

### Decisions to confirm with the user

1. Is a declaration index, explicitly labeled as such, the useful first milestone?
2. Is stable x86_64 acceptable for initial coverage, or are all published app architectures required at launch?
3. Do immutable resolved-manifest links satisfy V1, or are original GitHub YAML/JSON files a launch requirement? The latter adds build-to-source provenance and include-file mapping work.

## Sources

[org-api]: https://api.github.com/orgs/flathub-infra/repos?per_page=100
[sbom-readme]: https://github.com/razzeee/flatpak-sbom/blob/0993aa5bcf1b6b9c9ca7b7052cb5f3a619f74625/README.md
[sbom-cli]: https://github.com/razzeee/flatpak-sbom/blob/0993aa5bcf1b6b9c9ca7b7052cb5f3a619f74625/src/main.rs
[sbom-generation]: https://github.com/razzeee/flatpak-sbom/blob/0993aa5bcf1b6b9c9ca7b7052cb5f3a619f74625/src/sbom.rs#L15-L315
[sbom-components]: https://github.com/razzeee/flatpak-sbom/blob/0993aa5bcf1b6b9c9ca7b7052cb5f3a619f74625/src/sbom.rs#L317-L854
[sbom-identity]: https://github.com/razzeee/flatpak-sbom/blob/0993aa5bcf1b6b9c9ca7b7052cb5f3a619f74625/src/sbom.rs#L856-L1030
[sbom-manifest]: https://github.com/razzeee/flatpak-sbom/blob/0993aa5bcf1b6b9c9ca7b7052cb5f3a619f74625/src/manifest.rs
[sbom-ostree]: https://github.com/razzeee/flatpak-sbom/blob/0993aa5bcf1b6b9c9ca7b7052cb5f3a619f74625/src/ostree.rs#L96-L197
[sbom-ci]: https://github.com/razzeee/flatpak-sbom/blob/0993aa5bcf1b6b9c9ca7b7052cb5f3a619f74625/.github/workflows/ci.yml
[sbom-releases]: https://api.github.com/repos/razzeee/flatpak-sbom/releases
[builder-doc]: https://github.com/flathub-infra/flatpak-builder/blob/48933348c14a5d818783d3ef84b159641cfc59fa/doc/flatpak-builder.xml#L65-L106
[builder-writer]: https://github.com/flathub-infra/flatpak-builder/blob/48933348c14a5d818783d3ef84b159641cfc59fa/src/builder-manifest.c#L3370-L3400
[finding-sources]: https://github.com/flathub-infra/documentation/blob/81047075e2675d68beeeb152df5dd012d24a54c3/docs/01-for-users/12-finding-sources.md
[fedc-readme]: https://github.com/flathub-infra/flatpak-external-data-checker/blob/eb885e1bcb15644066573888127a381a54466155/README.md
[fedc-manifest]: https://github.com/flathub-infra/flatpak-external-data-checker/blob/eb885e1bcb15644066573888127a381a54466155/src/manifest.py#L98-L318
[fedc-model]: https://github.com/flathub-infra/flatpak-external-data-checker/blob/eb885e1bcb15644066573888127a381a54466155/src/lib/externaldata.py#L46-L160
[fedc-action]: https://github.com/flathub/flathub/blob/deefa1aaf2d9aaf633a3c19f52b28132318cf386/.github/actions/flatpak-external-data-checker/entrypoint.sh
[lint-manifest]: https://github.com/flathub-infra/flatpak-builder-lint/blob/d2597baa5f9108bbb5eec5082bc636e6a04ee5d9/flatpak_builder_lint/manifest.py
[pipeline-schema]: https://github.com/flathub-infra/vorarbeiter/blob/1ed808f82163776d1fdb407904f18b8930f7bdcd/app/schemas/pipelines.py#L34-L78
[build-recipes]: https://github.com/flathub-infra/vorarbeiter/blob/1ed808f82163776d1fdb407904f18b8930f7bdcd/justfile
[hooks-readme]: https://github.com/flathub-infra/flat-manager-hooks/blob/5fed04052e89d152b119a4fd4270d9ec88b1f426/README.md
[repro-readme]: https://github.com/flathub-infra/flathub-repro-checker/blob/94f645291720f858ebf272c62a43282464b01487/README.md
