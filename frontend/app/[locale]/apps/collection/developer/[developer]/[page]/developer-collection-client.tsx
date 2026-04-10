"use client"

import { useTranslations } from "next-intl"
import ApplicationCollectionSuspense from "../../../../../../../src/components/application/ApplicationCollectionSuspense"
import { mapAppsIndexToAppstreamListItem } from "../../../../../../../src/meilisearch"
import {
  DeveloperSummary,
  MeilisearchResponseAppsIndex,
} from "../../../../../../../src/codegen"
import { CheckBadgeIcon } from "@heroicons/react/20/solid"
import {
  CloudArrowDownIcon,
  CubeIcon,
  TagIcon,
} from "@heroicons/react/24/outline"
import { categoryToName, stringToCategory } from "src/types/Category"

interface Props {
  applications: MeilisearchResponseAppsIndex
  developer: string
  summary: DeveloperSummary | null
}

function DeveloperProfileHeader({
  developer,
  summary,
}: {
  developer: string
  summary: DeveloperSummary
}) {
  const t = useTranslations()

  return (
    <div className="mb-8">
      {/* Developer name and verification */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        <h1 className="text-4xl font-extrabold tracking-tight">{developer}</h1>
        {summary.is_verified && (
          <div className="flex items-center gap-1.5 text-flathub-celestial-blue">
            <CheckBadgeIcon className="size-6" />
            <span className="text-sm font-semibold">
              {t("developer-verified")}
            </span>
          </div>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Total apps */}
        <div className="text-center p-4 lg:p-5 rounded-xl bg-flathub-white dark:bg-flathub-arsenic border border-flathub-gainsborow/30 dark:border-flathub-granite-gray/30 shadow-sm">
          <div className="flex items-center justify-center gap-2 mb-2">
            <CubeIcon className="size-5 text-flathub-celestial-blue" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-flathub-celestial-blue mb-1">
            {summary.total_apps}
          </div>
          <div className="text-xs font-bold text-flathub-dark-gunmetal/70 dark:text-flathub-gainsborow/70 uppercase tracking-wide">
            {t("developer-apps-published")}
          </div>
        </div>

        {/* Total installs */}
        <div className="text-center p-4 lg:p-5 rounded-xl bg-flathub-white dark:bg-flathub-arsenic border border-flathub-gainsborow/30 dark:border-flathub-granite-gray/30 shadow-sm">
          <div className="flex items-center justify-center gap-2 mb-2">
            <CloudArrowDownIcon className="size-5 text-flathub-status-green dark:text-flathub-status-green-dark" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-flathub-status-green dark:text-flathub-status-green-dark mb-1">
            {summary.total_installs.toLocaleString()}
          </div>
          <div className="text-xs font-bold text-flathub-dark-gunmetal/70 dark:text-flathub-gainsborow/70 uppercase tracking-wide">
            {t("developer-total-installs-last-month", {
              count: summary.total_installs,
            })}
          </div>
        </div>

        {/* Verified apps */}
        {summary.verified_apps > 0 && (
          <div className="text-center p-4 lg:p-5 rounded-xl bg-flathub-white dark:bg-flathub-arsenic border border-flathub-gainsborow/30 dark:border-flathub-granite-gray/30 shadow-sm">
            <div className="flex items-center justify-center gap-2 mb-2">
              <CheckBadgeIcon className="size-5 text-flathub-celestial-blue" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-flathub-celestial-blue mb-1">
              {summary.verified_apps}
            </div>
            <div className="text-xs font-bold text-flathub-dark-gunmetal/70 dark:text-flathub-gainsborow/70 uppercase tracking-wide">
              {t("count-verified-desktop-apps")}
            </div>
          </div>
        )}

        {/* Categories */}
        {summary.main_categories.length > 0 && (
          <div className="text-center p-4 lg:p-5 rounded-xl bg-flathub-white dark:bg-flathub-arsenic border border-flathub-gainsborow/30 dark:border-flathub-granite-gray/30 shadow-sm">
            <div className="flex items-center justify-center gap-2 mb-2">
              <TagIcon className="size-5 text-flathub-sonic-silver dark:text-flathub-spanish-gray" />
            </div>
            <div className="flex flex-wrap justify-center gap-1.5 mb-1">
              {summary.main_categories.slice(0, 4).map((cat) => (
                <span
                  key={cat}
                  className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-flathub-gainsborow/50 dark:bg-flathub-granite-gray/30 text-flathub-dark-gunmetal dark:text-flathub-gainsborow"
                >
                  {categoryToName(stringToCategory(cat), t)}
                </span>
              ))}
            </div>
            <div className="text-xs font-bold text-flathub-dark-gunmetal/70 dark:text-flathub-gainsborow/70 uppercase tracking-wide">
              {t("categories")}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function DeveloperCollectionClient({
  applications,
  developer,
  summary,
}: Props) {
  const t = useTranslations()

  return (
    <div className="max-w-11/12 mx-auto my-0 mt-12 w-11/12 2xl:w-[1400px] 2xl:max-w-[1400px]">
      {summary && (
        <DeveloperProfileHeader developer={developer} summary={summary} />
      )}
      <ApplicationCollectionSuspense
        title={
          summary
            ? t("developer-apps-published")
            : t("apps-by-developer", { developer })
        }
        applications={applications.hits.map(mapAppsIndexToAppstreamListItem)}
        page={applications.page}
        totalPages={applications.totalPages}
        totalHits={applications.totalHits}
      />
    </div>
  )
}
