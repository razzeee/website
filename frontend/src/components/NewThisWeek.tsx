"use client"

import { useMemo, useRef } from "react"
import { useTranslations } from "next-intl"
import { motion, useInView } from "framer-motion"
import { MeilisearchResponseAppsIndex } from "../../codegen"
import { mapAppsIndexToAppstreamListItem } from "../../meilisearch"
import LogoImage from "./LogoImage"
import { Link } from "../../i18n/navigation"
import { ArrowRight, CalendarPlus } from "lucide-react"

interface NewThisWeekProps {
  recentlyAdded: MeilisearchResponseAppsIndex
}

function formatDayLabel(date: Date): string {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  if (date.toDateString() === today.toDateString()) return "Today"
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday"

  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
}

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1, delayChildren: 0.1 },
  },
}

const nodeVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
}

export function NewThisWeek({ recentlyAdded }: NewThisWeekProps) {
  const t = useTranslations()
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: "0px 0px -80px 0px" })

  // Group apps by day using added_at timestamp
  const grouped = useMemo(() => {
    const map = new Map<string, { date: Date; apps: ReturnType<typeof mapAppsIndexToAppstreamListItem>[] }>()

    for (const hit of recentlyAdded.hits) {
      const app = mapAppsIndexToAppstreamListItem(hit)
      const addedAt = hit.added_at
      if (!addedAt) {
        // No date info — bucket into "Recent"
        const key = "recent"
        if (!map.has(key)) {
          map.set(key, { date: new Date(), apps: [] })
        }
        map.get(key)!.apps.push(app)
        continue
      }

      const date = new Date(addedAt * 1000)
      const key = date.toDateString()
      if (!map.has(key)) {
        map.set(key, { date, apps: [] })
      }
      map.get(key)!.apps.push(app)
    }

    // Sort by date descending
    return Array.from(map.values()).sort(
      (a, b) => b.date.getTime() - a.date.getTime(),
    )
  }, [recentlyAdded.hits])

  if (grouped.length === 0) return null

  return (
    <section ref={ref} aria-labelledby="new-this-week-heading">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h2
          id="new-this-week-heading"
          className="flex items-center gap-2 text-2xl font-bold text-flathub-dark-gunmetal dark:text-flathub-gainsborow"
        >
          <CalendarPlus className="size-6 text-flathub-celestial-blue" aria-hidden="true" />
          {t("new-this-week")}
        </h2>
        <Link
          href="/apps/collection/recently-added"
          className="flex items-center gap-1 text-sm text-flathub-celestial-blue hover:underline"
        >
          {t("more-new-apps")}
          <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
        </Link>
      </div>

      {/* Timeline scroll container */}
      <div className="relative">
        {/* Connecting line */}
        <div className="pointer-events-none absolute inset-s-0 inset-e-0 top-[1.35rem] h-px bg-flathub-gainsborow/60 dark:bg-flathub-arsenic" />

        <div className="overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <motion.div
            className="flex gap-8 min-w-max"
            variants={containerVariants}
            initial="hidden"
            animate={isInView ? "visible" : "hidden"}
          >
            {grouped.map(({ date, apps }) => (
              <motion.div
                key={date.toDateString()}
                variants={nodeVariants}
                className="flex flex-col items-center gap-3"
              >
                {/* Day node dot + label */}
                <div className="flex flex-col items-center gap-1">
                  <div className="size-3 rounded-full border-2 border-flathub-celestial-blue bg-flathub-lotion dark:bg-flathub-dark-gunmetal ring-4 ring-flathub-lotion dark:ring-flathub-dark-gunmetal" />
                  <span className="whitespace-nowrap text-xs font-semibold text-flathub-sonic-silver dark:text-flathub-spanish-gray">
                    {formatDayLabel(date)}
                  </span>
                </div>

                {/* App icons */}
                <div className="flex max-w-48 flex-wrap justify-center gap-2">
                  {apps.slice(0, 6).map((app) => (
                    <Link
                      key={app.id}
                      href={`/apps/${app.id}`}
                      title={app.name}
                      className="group relative flex flex-col items-center gap-1"
                    >
                      <div className="rounded-xl shadow-sm transition duration-200 group-hover:scale-110 group-hover:shadow-md">
                        <LogoImage
                          iconUrl={app.icon}
                          appName={app.name}
                          size={48}
                        />
                      </div>
                      <span className="w-12 truncate text-center text-[10px] text-flathub-sonic-silver dark:text-flathub-spanish-gray">
                        {app.name}
                      </span>
                    </Link>
                  ))}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  )
}
