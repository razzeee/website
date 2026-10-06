import type { Meta, StoryObj } from "@storybook/nextjs-vite"

import SetupClient from "./setup-client"
import type { DistroSummary } from "../../../src/distro-setup"

const meta = {
  component: SetupClient,
  title: "pages/setup",
} satisfies Meta<typeof SetupClient>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    instructions: [
      {
        logo: "https://dl.flathub.org/media/tv/kodi/Kodi/4f8cbfae09dc6c8c55501a5d3f604fbb/icons/128x128/tv.kodi.Kodi.png",
        name: "Kodi Distro",
        translatedNameKey: "Kodi Distro",
      },
      {
        logo: "https://dl.flathub.org/media/tv/kodi/Kodi/4f8cbfae09dc6c8c55501a5d3f604fbb/icons/128x128/tv.kodi.Kodi.png",
        name: "Kodi2 Distro",
        translatedNameKey: "Kodi2 Distro",
      },
      {
        logo: "https://dl.flathub.org/media/tv/kodi/Kodi/4f8cbfae09dc6c8c55501a5d3f604fbb/icons/128x128/tv.kodi.Kodi.png",
        name: "Kodi3 Distro",
        translatedNameKey: "Kodi3 Distro",
      },
    ] satisfies DistroSummary[],
  },
}
