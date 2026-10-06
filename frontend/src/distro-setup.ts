import catalog from "./data/distro-setup.generated.json"
import type { SetupCatalogEntry, SetupText } from "./setup-messages"
import { ASSET_BASE_URL } from "./env"

export type { SetupText } from "./setup-messages"

export type DistroSetup = {
  name: string
  slug?: string
  logo: string
  logo_dark?: string
  translationKey: string
  translatedNameKey: string
  priority?: number
  introduction?: SetupText
  steps: SetupText[]
}

export type DistroSummary = Pick<
  DistroSetup,
  "name" | "slug" | "logo" | "logo_dark" | "translatedNameKey" | "priority"
>

const distros: SetupCatalogEntry[] = catalog

export const setupInstructions: DistroSetup[] = distros.map((distro) => ({
  name: distro.name,
  slug: distro.slug,
  translationKey: distro.translationKey,
  priority: distro.priority,
  introduction: distro.introduction,
  steps: distro.steps,
  logo: `${ASSET_BASE_URL}/img/distro/${distro.logo}`,
  logo_dark: distro.logo_dark
    ? `${ASSET_BASE_URL}/img/distro/${distro.logo_dark}`
    : undefined,
  translatedNameKey: `distros.${distro.translationKey}.distroName`,
}))

export async function fetchSetupInstructions() {
  return setupInstructions
}
