import { describe, expect, it } from "vitest"
import { generateSetupMessages, generateSetupCatalog } from "./setup-messages"
import { readSetupDefinitions, parseSetupDefinitions } from "./setup-source"
import catalog from "./data/distro-setup.generated.json"

const distroDefinitions = readSetupDefinitions()

describe("setup translation generation", () => {
  const ubuntu = distroDefinitions.find((distro) => distro.name === "Ubuntu")

  it("keeps the generated runtime catalog synchronized with YAML", () => {
    expect(
      JSON.parse(JSON.stringify(generateSetupCatalog(distroDefinitions))),
    ).toEqual(catalog)
  })

  it("rejects malformed YAML source definitions before generation", () => {
    expect(() => parseSetupDefinitions("name: Ubuntu")).toThrow(
      "must contain a list",
    )
    expect(() => parseSetupDefinitions("- name: Ubuntu")).toThrow("displayName")
    expect(() =>
      parseSetupDefinitions(JSON.stringify([{ ...ubuntu, steps: [{}] }])),
    ).toThrow("translationKey")
    expect(() =>
      parseSetupDefinitions(
        JSON.stringify([
          {
            ...ubuntu,
            steps: [{ ...ubuntu.steps[0], commands: { code: 123 } }],
          },
        ]),
      ),
    ).toThrow("commands.code")
  })

  it("keeps translation keys and output stable when steps are reordered", () => {
    expect(
      generateSetupMessages([
        { ...ubuntu, steps: [...ubuntu.steps].reverse() },
      ]),
    ).toEqual(generateSetupMessages([ubuntu]))
  })

  it("uses explicit keys rather than array positions", () => {
    const step = { ...ubuntu.steps[0], translationKey: "install-flatpak" }
    const introduction = {
      translationKey: "overview",
      text: "<text>Welcome</text>",
    }
    expect(
      generateSetupMessages([{ ...ubuntu, introduction, steps: [step] }]),
    ).toEqual({
      ubuntu: {
        distroName: ubuntu.displayName,
        overview: introduction.text,
        "install-flatpak": { name: step.name, text: step.text },
      },
    })
  })

  it("does not export commands, destinations, or presentation metadata to translators", () => {
    const messages = generateSetupMessages([ubuntu]).ubuntu
    expect(messages[ubuntu.steps[0].translationKey]).toEqual({
      name: ubuntu.steps[0].name,
      text: ubuntu.steps[0].text,
    })
    expect(messages).not.toHaveProperty("logo")
  })

  it("rejects duplicate distro namespaces", () => {
    expect(() => generateSetupMessages([ubuntu, ubuntu])).toThrow(
      "Duplicate distro translation key",
    )
  })

  it("rejects duplicate block keys instead of overwriting messages", () => {
    expect(() =>
      generateSetupMessages([
        { ...ubuntu, steps: [ubuntu.steps[0], ubuntu.steps[0]] },
      ]),
    ).toThrow("Invalid or duplicate translation key")
    expect(() =>
      generateSetupMessages([
        { ...ubuntu, introduction: { ...ubuntu.steps[0] } },
      ]),
    ).toThrow("Invalid or duplicate translation key")
  })

  it.each(["distroName", "nested.key", "__proto__"])(
    "rejects reserved or invalid block key %s",
    (translationKey) => {
      expect(() =>
        generateSetupMessages([
          { ...ubuntu, steps: [{ ...ubuntu.steps[0], translationKey }] },
        ]),
      ).toThrow("Invalid or duplicate translation key")
    },
  )
})
