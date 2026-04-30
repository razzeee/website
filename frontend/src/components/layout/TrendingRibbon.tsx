"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { useGetTrendingLastTwoWeeksCollectionTrendingGet } from "../../codegen/collection/collection"
import { mapAppsIndexToAppstreamListItem } from "../../meilisearch"
import LogoImage from "../LogoImage"
import { Link } from "../../i18n/navigation"
import { Flame, X } from "lucide-react"

const DISMISS_KEY = "flathub_trending_ribbon_dismissed"

export function TrendingRibbon() {
  const t = useTranslations()
  const [dismissed, setDismissed] = useState(true) // start hidden to avoid flash
  const [mounted, setMounted] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
    const isDismissed = sessionStorage.getItem(DISMISS_KEY) === "1"
    setDismissed(isDismissed)
  }, [])

  const { data } = useGetTrendingLastTwoWeeksCollectionTrendingGet(
    { per_page: 15 },
    {
      query: {
        enabled: mounted && !dismissed,
        staleTime: 1000 * 60 * 10,
      },
    },
  )

  const apps = data?.data?.hits?.map(mapAppsIndexToAppstreamListItem) ?? []

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1")
    setDismissed(true)
  }

  if (!mounted || dismissed || apps.length === 0) return null

  // Duplicate the list for a seamless loop
  const items = [...apps, ...apps]

  return (
    <div className="relative flex h-9 items-center overflow-hidden border-b border-flathub-gainsborow/60 bg-flathub-white dark:border-flathub-arsenic dark:bg-flathub-arsenic/50">
      {/* Label */}
      <div className="relative z-10 flex shrink-0 items-center gap-1.5 border-e border-flathub-gainsborow/60 bg-flathub-white px-3 py-1 text-xs font-semibold text-flathub-dark-gunmetal dark:border-flathub-arsenic dark:bg-flathub-arsenic/80 dark:text-flathub-gainsborow">
        <Flame
          className="size-3.5 text-orange-500"
          aria-hidden="true"
        />
        <span className="hidden sm:inline">{t("trending-now")}</span>
      </div>

      {/* Scrolling track */}
      <div className="relative flex-1 overflow-hidden">
        <div
          ref={trackRef}
          className="flex animate-[marquee_40s_linear_infinite] items-center gap-6 whitespace-nowrap hover:[animation-play-state:paused]"
          aria-hidden="true"
        >
          {items.map((app, i) => (
            <Link
              key={`${app.id}-${i}`}
              href={`/apps/${app.id}`}
              className="flex shrink-0 items-center gap-1.5 rounded px-1 py-0.5 text-xs text-flathub-dark-gunmetal transition hover:bg-flathub-gainsborow/60 dark:text-flathub-gainsborow dark:hover:bg-flathub-arsenic"
              tabIndex={-1}
            >
              <LogoImage iconUrl={app.icon} appName={app.name} size={16} />
              <span className="font-medium">{app.name}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        className="relative z-10 flex shrink-0 items-center justify-center p-2 text-flathub-sonic-silver transition hover:text-flathub-dark-gunmetal dark:hover:text-flathub-gainsborow"
        aria-label={t("dismiss")}
      >
        <X className="size-3.5" />
      </button>

      {/* Fade edges */}
      <div className="pointer-events-none absolute inset-y-0 start-[calc(theme(spacing.3)*2+1.125rem)] w-8 bg-gradient-to-r from-flathub-white to-transparent dark:from-flathub-arsenic/50" />
      <div className="pointer-events-none absolute inset-y-0 end-8 w-8 bg-gradient-to-l from-flathub-white to-transparent dark:from-flathub-arsenic/50" />
    </div>
  )
}
