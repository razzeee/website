# Setup instructions

Edit `src/data/distro.yml` to author setup pages. Each distro keeps its
English display name, prose, step titles, copyable commands, links, logos, and
listing priority together. `Distros.tsx` renders those definitions using the
existing translations and generates their HowTo structured data.

`public/locales/en/distros.json` and `src/data/distro-setup.generated.json` are
**generated**, not additional authoring locations. The latter contains only
runtime metadata and bindings, so browsers and Storybook do not need a YAML
parser or filesystem access, and English prose is not duplicated in page props.
Other locales remain translator-maintained. Their file layout and existing
translation keys are unchanged.

## Translation mapping

A distro's `translationKey` is its namespace below `distros` (including the
legacy `centos` namespace for CentOS Stream). `displayName` generates
`distros.<namespace>.distroName`; `name` remains its route identity.

Every introduction and step has its own explicit `translationKey`:

```yaml
translationKey: step-1
name: Install Flatpak
text: >-
  <text>Run:</text> <code></code>
commands:
  code: sudo apt install flatpak
```

For Ubuntu, this exports `distros.ubuntu.step-1.name` and
`distros.ubuntu.step-1.text`. `<code>` is bound to the command beside the text;
translators translate the prose, not the command. Introduction text exports to
`distros.<namespace>.<introduction.translationKey>` without a `.text` suffix.

The step array controls display order, **not translation identity**. Keep keys
stable when moving or inserting steps. Existing `step-N` keys are retained for
translation compatibility; new steps may use descriptive keys. Never reuse a
removed key for unrelated content. Duplicate and invalid keys fail generation.

## Rich-text bindings

Standard tags are `text` (paragraph), `header` (heading), `strong`, `em`, `link`
and `applink` (localized homepage), and `filelink` (Flathub repository file).
Use `textTag: "h2"` for legacy introductions whose `text` is a heading.
`commands` maps a tag to its copyable command. `links` maps tags to destinations,
with optional fixed `text` for labels such as `chrome://os-settings`.

## Updating instructions

1. Edit the distro definition, including English strings and bindings together.
   To add a distro, add its definition and logos under `public/img/distro`; use a
   slash-free `slug` if its route name contains `/`. No new React implementation
   or hand-written translation map is needed.
2. Run `pnpm generate:setup-messages` from `frontend/` and commit both generated
   JSON files alongside the YAML definition. Generation never writes other
   locales. Translate those through the normal translation workflow.
3. Run `pnpm check:setup-messages` and `pnpm test`. CI checks that the generated
   source is current and runs catalog, binding, and rendering tests.
4. Use individual distro stories for visual checks.

Use folded `>-` scalars for prose and literal `|-` scalars for multiline
commands. Folding joins prose lines with spaces; literal blocks preserve command
newlines. The generator validates required fields and bindings before writing.

There is no separate upstream mirror or importer. Consult upstream instructions
as a reference, then update the definition directly. Do not edit generated
English messages or runtime JSON, including when resolving translation-source changes: apply
the intended English change to the definition and regenerate instead.
