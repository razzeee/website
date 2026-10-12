import { test, expect, vi } from "vitest"
import type { ReactNode, ComponentProps } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import deepmerge from "deepmerge"
import common from "../../../public/locales/en/common.json"
import distros from "../../../public/locales/en/distros.json"
import { fetchSetupInstructions } from "../../distro-setup"
import DistroSetupClient from "../../../app/[locale]/setup/[distro]/distro-setup-client"
import { distroMap } from "./Distros"
import { CentOSStream } from "./Distros.stories"

vi.mock("src/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

// Expose animation identity without needing a browser or running animations.
vi.mock("framer-motion", () => ({
  motion: {
    picture: ({
      layoutId,
      ...props
    }: ComponentProps<"picture"> & { layoutId: string }) => (
      <picture data-layout-id={layoutId} {...props} />
    ),
    h1: ({
      layoutId,
      children,
      ...props
    }: ComponentProps<"h1"> & { layoutId: string }) => (
      <h1 data-layout-id={layoutId} {...props}>
        {children}
      </h1>
    ),
  },
  LayoutGroup: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

const instructions = await fetchSetupInstructions()
const pages = distroMap("en")

function render(
  page: ReactNode,
  locale = "en",
  messages = { ...common, distros },
) {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      timeZone="UTC"
      messages={messages}
      onError={(error) => {
        throw error
      }}
    >
      {page}
    </NextIntlClientProvider>,
  )
}

test("every listed distro has a setup page", () => {
  expect(pages.size).toBe(instructions.length)
  for (const distro of instructions) {
    expect(pages.has(distro.name.replaceAll("/", "")), distro.name).toBe(true)
  }
})

for (const distro of instructions) {
  test(`renders ${distro.name} with valid HowTo URLs and undamaged text`, () => {
    const html = render(pages.get(distro.name.replaceAll("/", "")))
    const scripts = [
      ...html.matchAll(
        /<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs,
      ),
    ]
    const schemas = scripts
      .map((script) => JSON.parse(script[1]))
      .filter((schema) => schema["@type"] === "HowTo")
    const key = distro.translatedNameKey.split(".")[1]
    const messages = distros[key]
    expect(
      Object.keys(messages).filter((key) => key.startsWith("step-")),
    ).toEqual(
      Object.keys(messages)
        .filter((key) => key.startsWith("step-"))
        .map((_, index) => `step-${index + 1}`),
    )
    const translatedSteps = Object.entries(messages)
      .filter(([key]) => key.startsWith("step-"))
      .map(([, value]) => value as { name: string; text: string })
    const stepCount = Object.keys(messages).filter((key) =>
      key.startsWith("step-"),
    ).length
    expect(schemas.length).toBe(stepCount ? 1 : 0)
    for (const schema of schemas) {
      expect(schema.step.length).toBe(
        Object.keys(messages).filter((key) => key.startsWith("step-")).length,
      )
      for (const [index, step] of schema.step.entries()) {
        expect(step.url).toBe(
          `https://flathub.org/setup/${encodeURIComponent(distro.slug ?? distro.name)}`,
        )
        // next-seo escapes punctuation in JSON-LD string values.
        const text = step.itemListElement[0].text.replace(
          /&(quot|apos|amp|lt|gt);/g,
          (_, entity) =>
            ({ quot: '"', apos: "'", amp: "&", lt: "<", gt: ">" })[entity],
        )
        expect(text).toBe(
          translatedSteps[index].text
            .replace(/<[^>]*>/g, "")
            .replace(/\s{2,}/g, " ")
            .trim(),
        )
      }
      expect(schema.step.map((step) => step.name)).toEqual(
        translatedSteps.map((step) => step.name),
      )
    }
  })
}

const bazaarDistros = [
  "Ubuntu",
  "Debian",
  "Alpine",
  "Pardus",
  "Solus",
  "Zorin OS",
  "Vanilla OS",
]

const localesDirectory = new URL("../../../public/locales/", import.meta.url)
for (const locale of readdirSync(localesDirectory)) {
  if (!existsSync(new URL(`${locale}/distros.json`, localesDirectory))) continue
  const messages = deepmerge(
    { ...common, distros },
    {
      ...JSON.parse(
        readFileSync(
          new URL(`${locale}/common.json`, localesDirectory),
          "utf8",
        ),
      ),
      distros: JSON.parse(
        readFileSync(
          new URL(`${locale}/distros.json`, localesDirectory),
          "utf8",
        ),
      ),
    },
  )
  for (const name of bazaarDistros) {
    test(`${locale}/${name} renders migrated translations with matching commands`, () => {
      const html = render(distroMap(locale).get(name), locale, messages)
      const bazaarSteps = [
        ...html.matchAll(/<li><h2>.*?<\/h2>.*?<\/li>/gs),
      ].filter((step) =>
        step[0].includes("install flathub io.github.kolunmi.Bazaar"),
      )
      expect(bazaarSteps).toHaveLength(1)
      expect(html).not.toMatch(
        /gnome-software-plugin-flatpak|discover-backend-flatpak/,
      )
      if (["Ubuntu", "Debian", "Alpine", "Pardus", "Solus"].includes(name)) {
        expect(html.indexOf("flatpak remote-add")).toBeGreaterThan(-1)
        expect(html.indexOf("flatpak remote-add")).toBeLessThan(
          bazaarSteps[0].index,
        )
      }
    })
  }
}

for (const distro of instructions) {
  test(`Bazaar instructions and commands are scoped correctly for ${distro.name}`, () => {
    const html = render(pages.get(distro.name.replaceAll("/", "")))
    if (!bazaarDistros.includes(distro.name)) {
      expect(html).not.toContain("io.github.kolunmi.Bazaar")
      expect(
        (distro.steps ?? []).some((step) => step.name === "Install Bazaar"),
      ).toBe(false)
      return
    }
    const steps = [...html.matchAll(/<li><h2>(.*?)<\/h2>(.*?)<\/li>/gs)]
    const bazaarIndex = steps.findIndex((step) => step[1] === "Install Bazaar")
    expect(steps.filter((step) => step[1] === "Install Bazaar")).toHaveLength(1)
    const command =
      distro.name === "Vanilla OS"
        ? "host-shell flatpak --user install flathub io.github.kolunmi.Bazaar"
        : "flatpak install flathub io.github.kolunmi.Bazaar"
    expect(steps[bazaarIndex][2]).toContain(command)
    expect(
      distro.steps.find((step) => step.name === "Install Bazaar").text,
    ).toContain(command)
    expect(html).not.toMatch(
      /gnome-software-plugin-flatpak|discover-backend-flatpak/,
    )
    const remoteIndex = steps.findIndex(
      (step) => step[1] === "Add the Flathub repository",
    )
    if (remoteIndex !== -1) expect(bazaarIndex).toBeGreaterThan(remoteIndex)
    const restartIndex = steps.findIndex((step) => step[1] === "Restart")
    if (restartIndex !== -1) expect(bazaarIndex).toBeLessThan(restartIndex)
    if (distro.name === "Vanilla OS") {
      expect(html.indexOf("host-shell flatpak remote-add")).toBeLessThan(
        html.indexOf("<h2>Install Bazaar</h2>"),
      )
    }
    expect(steps.map((step) => step[1])).toEqual(
      distro.steps.map((step) => step.name),
    )
  })
}

test("Nura renders its built-in Flatpak introduction", () => {
  const html = render(pages.get("Nura"))
  expect(html).toContain("Flatpak is installed by default on Nura!")
  expect(html).toContain('href="/"')
})

test("CentOS Stream story renders the actual distro map entry", () => {
  const story = CentOSStream.render as () => ReactNode
  expect(render(story())).toContain("CentOS Stream")
})

test("Pisi breadcrumb uses the slash-free route alias", () => {
  const distro = instructions.find((distro) => distro.name === "Pisi GNU/Linux")
  const html = render(<DistroSetupClient distroData={distro} locale="en" />)
  expect(html).toContain('href="/setup/Pisi%20GNU%20Linux"')
  expect(html).not.toContain('href="/setup/Pisi%20GNU%2FLinux"')
})

test("T2 SDE animation identity matches the setup listing", () => {
  const html = render(pages.get("T2 SDE"))
  expect(html).toContain('data-layout-id="distro-logo-T2-SDE"')
  expect(html).toContain('data-layout-id="distro-name-T2-SDE"')
})
