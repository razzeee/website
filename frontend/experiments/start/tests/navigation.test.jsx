import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { Link, useRouter } from "../src/adapters/navigation"
import { syncLocaleCookie } from "../src/locale-cookie.mjs"
import { languages } from "../src/locales.mjs"

const mocks = vi.hoisted(() => ({
  link: null,
  navigate: vi.fn(),
  preload: vi.fn(),
  invalidate: vi.fn(),
  back: vi.fn(),
}))
vi.mock("use-intl", () => ({ useLocale: () => "en" }))
vi.mock("@tanstack/react-router", () => ({
  Link: (props) => {
    mocks.link = props
    return null
  },
  useNavigate: () => mocks.navigate,
  useRouter: () => ({
    preloadRoute: mocks.preload,
    invalidate: mocks.invalidate,
    history: { back: mocks.back },
  }),
}))

let writes
beforeEach(() => {
  writes = []
  vi.stubGlobal("document", {
    set cookie(value) {
      writes.push(value)
    },
  })
  vi.clearAllMocks()
})
afterEach(() => vi.unstubAllGlobals())

describe("client locale preferences", () => {
  it("writes a root-scoped session preference only for supported language switches", () => {
    for (const locale of languages.filter((locale) => locale !== "en")) {
      syncLocaleCookie("en", locale)
    }
    expect(writes).toEqual(
      languages
        .filter((locale) => locale !== "en")
        .map((locale) => `NEXT_LOCALE=${locale}; SameSite=lax; Path=/`),
    )
    writes.length = 0
    for (const locale of [
      undefined,
      null,
      "en",
      "invalid",
      "de; Path=/other",
    ]) {
      syncLocaleCookie("en", locale)
    }
    expect(writes).toEqual([])
    vi.stubGlobal("document", undefined)
    expect(() => syncLocaleCookie("en", "de")).not.toThrow()
  })

  it("does not write during rendering or prefetch and disables cross-locale link prefetch", () => {
    const onClick = vi.fn(() =>
      expect(writes).toEqual(["NEXT_LOCALE=de; SameSite=lax; Path=/"]),
    )
    renderToStaticMarkup(
      <Link href="/about?tab=1#details" locale="de" prefetch onClick={onClick}>
        Deutsch
      </Link>,
    )
    expect(writes).toEqual([])
    expect(mocks.link.to).toBe("/de/about?tab=1#details")
    expect(mocks.link.preload).toBe(false)
    expect(mocks.link.hrefLang).toBe("de")
    const event = { preventDefault: vi.fn() }
    mocks.link.onClick(event)
    expect(onClick).toHaveBeenCalledWith(event)
  })

  it("preserves same-locale link handlers and prefetch settings without overwriting the preference", () => {
    for (const locale of [undefined, "en"]) {
      renderToStaticMarkup(
        <Link href="/about" locale={locale} prefetch={false}>
          About
        </Link>,
      )
      expect(mocks.link.preload).toBe(false)
      mocks.link.onClick({})
      expect(writes).toEqual([])
    }
    renderToStaticMarkup(<Link href="/about">About</Link>)
    expect(mocks.link.preload).toBe("intent")
  })

  it("updates preferences before push/replace, but not ordinary navigation or prefetch", () => {
    const Read = vi.fn(() => null)
    function ReadRouter() {
      return <Read router={useRouter()} />
    }
    renderToStaticMarkup(<ReadRouter />)
    const router = Read.mock.calls[0][0].router
    mocks.navigate.mockImplementation(() => {
      expect(writes.at(-1)).toContain("NEXT_LOCALE=de")
      return Promise.resolve()
    })
    router.push("/about?q=1", { locale: "de" })
    expect(mocks.navigate).toHaveBeenLastCalledWith({ to: "/de/about?q=1" })
    router.replace("/en/about#details", { locale: "de" })
    expect(mocks.navigate).toHaveBeenLastCalledWith({
      to: "/de/about#details",
      replace: true,
    })
    expect(writes).toHaveLength(2)
    writes.length = 0
    mocks.navigate.mockImplementation(() => Promise.resolve())
    router.push("/about")
    router.replace("/about", { locale: "en" })
    router.prefetch("/about")
    expect(writes).toEqual([])
  })
})
