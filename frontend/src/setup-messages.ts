export type SetupTextDefinition = {
  translationKey: string
  text: string
  textTag?: string
  commands?: Record<string, string>
  links?: Record<string, { href: string; text?: string }>
}

export type DistroDefinition = {
  name: string
  displayName: string
  translationKey: string
  slug?: string
  logo: string
  logo_dark?: string
  priority?: number
  introduction?: SetupTextDefinition
  steps: (SetupTextDefinition & { name: string })[]
}

export type SetupText = Omit<SetupTextDefinition, "text">

export type SetupCatalogEntry = Omit<
  DistroDefinition,
  "displayName" | "introduction" | "steps"
> & {
  introduction?: SetupText
  steps: SetupText[]
}

export function generateSetupCatalog(
  distros: DistroDefinition[],
): SetupCatalogEntry[] {
  function renderingData({
    translationKey,
    textTag,
    commands,
    links,
  }: SetupTextDefinition): SetupText {
    return { translationKey, textTag, commands, links }
  }
  return distros.map(
    ({ displayName: _displayName, introduction, steps, ...metadata }) => ({
      ...metadata,
      introduction: introduction ? renderingData(introduction) : undefined,
      steps: steps.map(renderingData),
    }),
  )
}

export type SetupMessages = Record<
  string,
  Record<string, string | { name: string; text: string }>
>

// Render order comes from the step array; translation identity comes from keys.
// Keep these independent so moving a step cannot silently reassign translations.
export function generateSetupMessages(
  distros: DistroDefinition[],
): SetupMessages {
  const namespaces = new Set<string>()
  return Object.fromEntries(
    distros.map((distro) => {
      if (!/^[a-z][a-z0-9_]*$/.test(distro.translationKey)) {
        throw new Error(
          `Invalid distro translation key: ${distro.translationKey}`,
        )
      }
      if (namespaces.has(distro.translationKey)) {
        throw new Error(
          `Duplicate distro translation key: ${distro.translationKey}`,
        )
      }
      namespaces.add(distro.translationKey)

      const messages: SetupMessages[string] = { distroName: distro.displayName }
      const keys = new Set(["distroName"])
      function add(key: string, value: SetupMessages[string][string]) {
        if (!/^[a-z][a-zA-Z0-9_-]*$/.test(key) || keys.has(key)) {
          throw new Error(
            `Invalid or duplicate translation key: ${distro.translationKey}.${key}`,
          )
        }
        keys.add(key)
        messages[key] = value
      }

      if (distro.introduction) {
        add(distro.introduction.translationKey, distro.introduction.text)
      }
      // Sort only the generated messages, not display order, for stable diffs.
      for (const step of [...distro.steps].sort((a, b) =>
        a.translationKey.localeCompare(b.translationKey, "en", {
          numeric: true,
        }),
      )) {
        add(step.translationKey, { name: step.name, text: step.text })
      }
      return [distro.translationKey, messages]
    }),
  )
}
