import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { useState } from "react"
import { NextIntlClientProvider } from "next-intl"
import messages from "../../../public/locales/en/common.json"
import { HeroBanner } from "./HeroBanner"

const heroBannerData = ["First app", "Second app", "Third app"].map(
  (name, i) => ({
    app: { isFullscreen: false },
    appstream: {
      id: `org.example.App${i}`,
      name,
      summary: "Explore an app from the community",
      icon: "/img/logo/flathub-logo.svg",
      branding: [
        {
          scheme_preference: "light" as const,
          type: "primary" as const,
          value: "#e8f8ff",
        },
        {
          scheme_preference: "dark" as const,
          type: "primary" as const,
          value: "#082838",
        },
      ],
      screenshots: [],
    },
  }),
)

const meta = {
  component: HeroBanner,
  title: "Components/Application/HeroBanner interactions",
  args: { heroBannerData },
} satisfies Meta<typeof HeroBanner>
export default meta
type Story = StoryObj<typeof meta>

export const Rotating: Story = {}
export const Manual: Story = { args: { autoplay: false, currentIndex: 1 } }
export const SingleSlide: Story = {
  args: { heroBannerData: heroBannerData.slice(0, 1) },
}
export const Rtl: Story = {
  args: { autoplay: false },
  decorators: [
    (Story) => (
      <NextIntlClientProvider locale="ar" messages={messages}>
        <Story />
      </NextIntlClientProvider>
    ),
  ],
}
export const Controlled: Story = {
  render: function ControlledBanner(args) {
    const [currentIndex, setCurrentIndex] = useState(2)
    return (
      <>
        <button onClick={() => setCurrentIndex(0)}>Show first app</button>
        <HeroBanner {...args} autoplay={false} currentIndex={currentIndex} />
      </>
    )
  },
}
