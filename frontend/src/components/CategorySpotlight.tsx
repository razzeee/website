"use client"

import { useMemo, useRef } from "react"
import { useTranslations } from "next-intl"
import { motion, useInView } from "framer-motion"
import {
  MainCategory,
  MeilisearchResponseAppsIndex,
} from "../../codegen"
import { mapAppsIndexToAppstreamListItem } from "../../meilisearch"
import { categoryToName } from "../../types/Category"
import LogoImage from "../LogoImage"
import { Link } from "../../i18n/navigation"
import { ArrowRight } from "lucide-react"

interface CategorySpotlightProps {
  topAppsByCategory: {
    category: MainCategory
    apps: MeilisearchResponseAppsIndex
  }[]
}

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.07, delayChildren: 0.05 },
  },
}

const cardVariants = {
  hidden: { opacity: 0, scale: 0.96, y: 12 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" },
  },
}

function CategoryCard({
  category,
  apps,
}: {
  category: MainCategory
  apps: MeilisearchResponseAppsIndex
}) {
  const t = useTranslations()
  const appItems = useMemo(
    () => apps.hits.slice(0, 9).map(mapAppsIndexToAppstreamListItem),
    [apps.hits],
  )

  const categoryName = categoryToName(category, t)
  const totalApps = apps.estimatedTotalHits ?? appItems.length

  return (
    <motion.div variants={cardVariants}>
      <Link
        href={`/apps/category/${encodeURIComponent(category)}`}
        className="group relative flex h-52 flex-col overflow-hidden rounded-xl shadow-md transition duration-300 hover:shadow-xl hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flathub-celestial-blue"
        aria-label={`${categoryName} — ${t("apps-in-category", { count: totalApps })}`}
      >
        {/* Tiled icon mosaic background */}
        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-0.5 p-3 opacity-60 group-hover:opacity-80 transition-opacity duration-300">
          {Array.from({ length: 9 }).map((_, idx) => {
            const app = appItems[idx]
            return (
              <div
                key={idx}
                className="flex items-center justify-center rounded-lg"
              >
                {app ? (
                  <div className="transition duration-300 group-hover:scale-105">
                    <LogoImage
                      iconUrl={app.icon}
                      appName={app.name}
                      size={48}
                    />
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-flathub-dark-gunmetal/90 via-flathub-dark-gunmetal/30 to-transparent" />

        {/* Content */}
        <div className="relative mt-auto flex items-end justify-between p-4">
          <div>
            <h3 className="text-base font-bold text-white leading-tight">
              {categoryName}
            </h3>
            <p className="mt-0.5 text-xs text-white/70">
              {t("apps-in-category", { count: totalApps })}
            </p>
          </div>
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm transition duration-200 group-hover:bg-white/30">
            <ArrowRight className="size-4 text-white rtl:rotate-180" aria-hidden="true" />
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

export function CategorySpotlight({ topAppsByCategory }: CategorySpotlightProps) {
  const t = useTranslations()
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: "0px 0px -60px 0px" })

  return (
    <section ref={ref} aria-labelledby="explore-categories-heading">
      <h2
        id="explore-categories-heading"
        className="mb-4 text-2xl font-bold text-flathub-dark-gunmetal dark:text-flathub-gainsborow"
      >
        {t("explore-categories")}
      </h2>
      <motion.div
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
        variants={containerVariants}
        initial="hidden"
        animate={isInView ? "visible" : "hidden"}
      >
        {topAppsByCategory.map(({ category, apps }) => (
          <CategoryCard key={category} category={category} apps={apps} />
        ))}
      </motion.div>
    </section>
  )
}
