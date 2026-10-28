import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"
import { beforeEach, describe, expect, it, vi } from "vitest"
import messages from "../../../public/locales/en/common.json"
import DependencySearch from "./search-client"
import ManifestView from "./manifests/[id]/manifest-client"

const state = vi.hoisted(() => ({
  search: undefined as unknown,
  snapshot: undefined as unknown,
  error: false,
  params: "q=openssl",
}))
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(state.params),
}))
vi.mock("src/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: ReactNode
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock("src/codegen/dependencies/dependencies", () => ({
  useSearchDependenciesDependenciesGet: () => ({
    data: state.search ? { data: state.search } : undefined,
    isError: state.error,
    isPending: false,
    refetch: vi.fn(),
  }),
  useGetDependencySnapshotDependenciesSnapshotsSnapshotIdGet: () => ({
    data: state.snapshot ? { data: state.snapshot } : undefined,
    isError: state.error,
    isPending: false,
    refetch: vi.fn(),
  }),
}))

function render(children: ReactNode) {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale="en"
      timeZone="UTC"
      messages={{ "dependency-index": messages["dependency-index"] }}
    >
      {children}
    </NextIntlClientProvider>,
  )
}

beforeEach(() => {
  state.error = false
  state.params = "q=openssl"
  state.search = {
    coverage: {
      total: 1,
      complete: 0,
      partial: 0,
      pending: 0,
      missing: 1,
      error: 0,
      stale: 1,
      last_observed_at: "2026-10-28T10:00:00",
    },
    matches: [],
    next_cursor: null,
  }
  state.snapshot = undefined
})

describe("dependency evidence pages", () => {
  it("labels scope and empty search without claiming dependency absence", () => {
    const html = render(<DependencySearch />)
    expect(html).toContain("Stable · x86_64 · App manifests")
    expect(html).toContain(
      "Results come from build manifests, not installed files",
    )
    expect(html).toContain(
      "Apps outside this index may still use this dependency",
    )
  })
  it("links stale evidence to the exact immutable declaration", () => {
    state.search = {
      ...(state.search as object),
      matches: [
        {
          id: 1,
          app_id: "org.example.App",
          snapshot_id: 7,
          pointer: "/modules/1/sources/0",
          module_path: "openssl",
          kind: "git",
          source_url: "javascript:alert(1)",
          evidence: { branch: "main" },
          stale: true,
          collected_at: "2026-10-27T10:00:00",
        },
      ],
    }
    const html = render(<DependencySearch />)
    expect(html).toContain(
      "/dependencies/manifests/7?pointer=%2Fmodules%2F1%2Fsources%2F0",
    )
    expect(html).toContain("Out of date")
    expect(html).toContain("branch")
    expect(html).not.toContain('href="javascript:')
  })
  it("shows the selected declaration and escapes manifest content", () => {
    state.params = "pointer=%2Fmodules%2F0"
    state.snapshot = {
      repository: "https://dl.flathub.org/repo",
      ref: "app/org.example.App/x86_64/stable",
      commit: "abc",
      digest: "123",
      manifest_path: "/files/manifest.json",
      created_at: "2026-10-28T10:00:00",
      diagnostics: [],
      manifest: { modules: [{ name: "<script>alert(1)</script>" }] },
    }
    const html = render(<ManifestView id={7} />)
    expect(html).toContain("Selected declaration")
    expect(html).toContain("&lt;script&gt;")
    expect(html).not.toContain("<script>alert")
  })
  it("shows a retryable error instead of an empty result", () => {
    state.error = true
    state.search = undefined
    const html = render(<DependencySearch />)
    expect(html).toContain("Could not load manifests")
    expect(html).not.toContain("No matches in the indexed apps")
  })
})
