"use client"

import { useTranslations } from "next-intl"
import Breadcrumbs from "../../../../src/components/Breadcrumbs"
import { DistroSetup } from "../../../../src/distro-setup"
import { DistroInstructions } from "../../../../src/components/setup/Distros"
import React from "react"
import { LayoutGroup } from "framer-motion"

interface Props {
  distroData: DistroSetup
}

export default function DistroSetupClient({ distroData }: Props) {
  const t = useTranslations()

  const translatedDistroName = t(distroData.translatedNameKey)

  const pages = [
    {
      name: t("setup-flathub"),
      href: "/setup",
      current: false,
    },
    {
      name: translatedDistroName,
      href: `/setup/${encodeURIComponent(distroData.slug ?? distroData.name)}`,
      current: true,
    },
  ]

  return (
    <LayoutGroup>
      <div className="max-w-11/12 mx-auto w-11/12 space-y-10 pt-4 2xl:w-[1400px] 2xl:max-w-[1400px]">
        <div className="mx-auto max-w-2xl">
          <Breadcrumbs pages={pages} />
        </div>

        <div className="prose mx-auto dark:prose-invert prose-pre:rounded-xl">
          <div key={distroData.name} className="space-y-4">
            <DistroInstructions distro={distroData} />
          </div>
        </div>
      </div>
    </LayoutGroup>
  )
}
