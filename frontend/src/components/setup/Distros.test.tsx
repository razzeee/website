import assert from "node:assert/strict"
import { test, vi } from "vitest"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"
import common from "../../../public/locales/en/common.json"
import distros from "../../../public/locales/en/distros.json"
import { setupInstructions, type SetupText } from "../../distro-setup"
import { generateSetupMessages } from "../../setup-messages"
import { readSetupDefinitions } from "../../setup-source"
import { DistroInstructions } from "./Distros"

// Next's router is not available in the standalone SSR test runner.
vi.mock("src/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

test("catalog covers every translated distro and step", () => {
  assert.equal(
    new Set(setupInstructions.map((d) => d.name)).size,
    Object.keys(distros).length,
  )
  assert.deepEqual(
    setupInstructions.map((d) => d.translationKey).sort(),
    Object.keys(distros).sort(),
  )
  for (const distro of setupInstructions) {
    const messages = distros[distro.translationKey]
    assert.deepEqual(
      [
        "distroName",
        ...(distro.introduction ? [distro.introduction.translationKey] : []),
        ...distro.steps.map((block) => block.translationKey),
      ].sort(),
      Object.keys(messages).sort(),
      distro.name,
    )
  }
})

test("generated English messages match the committed translation source", () => {
  assert.deepEqual(generateSetupMessages(readSetupDefinitions()), distros)
})

function escaped(text: string) {
  return renderToStaticMarkup(<span>{text}</span>).slice(6, -7)
}

function checkBindings(html: string, block: SetupText) {
  for (const command of Object.values(block.commands ?? {})) {
    assert.ok(html.includes(escaped(command)), `Missing command: ${command}`)
  }
  for (const link of Object.values(block.links ?? {})) {
    assert.ok(html.includes(`href="${escaped(link.href)}"`), link.href)
    if (link.text) assert.ok(html.includes(escaped(link.text)), link.text)
  }
}

for (const distro of setupInstructions) {
  test(`renders ${distro.name} with its translation bindings`, () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider
        locale="en"
        timeZone="UTC"
        messages={{ ...common, distros }}
        onError={(error) => {
          throw error
        }}
      >
        <DistroInstructions distro={distro} />
      </NextIntlClientProvider>,
    )
    const messages = distros[distro.translationKey]
    assert.ok(html.includes(escaped(messages.distroName)))
    for (const block of distro.steps) {
      assert.ok(
        html.includes(
          `<h2>${escaped(messages[block.translationKey].name)}</h2>`,
        ),
      )
      checkBindings(html, block)
    }
    if (distro.introduction) checkBindings(html, distro.introduction)
    assert.equal(html.includes('class="distrotut"'), distro.steps.length > 0)
    assert.equal(html.includes('"@type":"HowTo"'), distro.steps.length > 0)
    if (distro.steps.length) {
      assert.ok(
        html.includes(
          `https://flathub.org/setup/${encodeURIComponent(distro.slug ?? distro.name)}`,
        ),
      )
    }
    if (distro.logo_dark)
      assert.ok(html.includes(`srcSet="${distro.logo_dark}"`))
  })
}

test("featured order is preserved", () => {
  assert.deepEqual(
    [...setupInstructions]
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
      .slice(0, 8)
      .map((d) => d.name),
    [
      "Ubuntu",
      "Debian",
      "Chrome OS",
      "Fedora",
      "Arch",
      "Linux Mint",
      "openSUSE",
      "Manjaro",
    ],
  )
})

test("reordering steps preserves translation identity in rendered titles and structured data", () => {
  const original = setupInstructions.find((distro) => distro.name === "Ubuntu")
  const distro = { ...original, steps: [...original.steps].reverse() }
  const html = renderToStaticMarkup(
    <NextIntlClientProvider
      locale="en"
      timeZone="UTC"
      messages={{ ...common, distros }}
      onError={(error) => {
        throw error
      }}
    >
      <DistroInstructions distro={distro} />
    </NextIntlClientProvider>,
  )
  const names = distro.steps.map(
    (block) => distros.ubuntu[block.translationKey].name,
  )
  let previous = -1
  for (const name of names) {
    const position = html.indexOf(`<h2>${escaped(name)}</h2>`)
    assert.ok(position > previous, `Wrong display order for ${name}`)
    previous = position
  }
  const schema = JSON.parse(
    html.match(
      /<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/s,
    )[1],
  )
  assert.deepEqual(
    schema.step.map((step) => step.name),
    names,
  )
})

test("rendering props omit English source strings", () => {
  for (const distro of setupInstructions) {
    assert.ok(!("displayName" in distro))
    for (const block of [distro.introduction, ...distro.steps].filter(
      Boolean,
    )) {
      assert.ok(!("text" in block))
      assert.ok(!("name" in block))
    }
  }
})

test("preserves exceptional introductions and safe distro slug", () => {
  assert.ok(setupInstructions.find((d) => d.name === "Solus").introduction)
  assert.equal(
    setupInstructions.find((d) => d.name === "Pisi GNU/Linux").slug,
    "Pisi GNU Linux",
  )
  for (const name of ["Endless OS", "Linux Mint", "Pop!_OS", "KDE neon"]) {
    assert.equal(
      setupInstructions.find((d) => d.name === name).introduction.textTag,
      "h2",
    )
  }
})
