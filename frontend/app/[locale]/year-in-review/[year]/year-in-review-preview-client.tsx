"use client"

import { useUserContext } from "../../../../src/context/user-info"
import {
  useGetYearInReviewYearInReviewYearGet,
} from "../../../../src/codegen"
import { Permission } from "../../../../src/codegen/model"
import { YearInReview } from "../../../../src/components/application/YearInReview"
import { Link } from "src/i18n/navigation"
import clsx from "clsx"
import { useTranslations } from "next-intl"
import Spinner from "../../../../src/components/Spinner"

const MIN_YEAR = 2018

interface YearInReviewPreviewClientProps {
  year: number
  locale: string
  availableYears: number[]
}

export function YearInReviewPreviewClient({
  year,
  locale,
  availableYears,
}: YearInReviewPreviewClientProps) {
  const t = useTranslations()
  const user = useUserContext()

  const isAdmin =
    !user.loading &&
    !!user.info?.permissions.some(
      (a) => a === Permission["quality-moderation"],
    )

  const query = useGetYearInReviewYearInReviewYearGet(
    year,
    { locale },
    {
      query: {
        enabled: isAdmin,
        retry: false,
      },
      axios: { withCredentials: true },
    },
  )

  // Show spinner while checking auth or loading data
  if (user.loading || (isAdmin && query.isLoading)) {
    return <Spinner size="m" />
  }

  // Not an admin or data unavailable: show unauthorized message
  if (!isAdmin || query.isError || !query.data?.data) {
    return (
      <div className="max-w-11/12 mx-auto my-0 w-11/12 2xl:w-[1400px] 2xl:max-w-[1400px]">
        <h1 className="my-8">{t("whoops")}</h1>
        <p>{t("unauthorized-to-view")}</p>
        {t.rich("retry-or-go-home", {
          link: (chunk) => (
            <a className="no-underline hover:underline" href=".">
              {chunk}
            </a>
          ),
        })}
      </div>
    )
  }

  const yearInReviewData = query.data.data
  const hasPreviousYear = yearInReviewData.year > MIN_YEAR
  const hasGeographicData =
    yearInReviewData.year >= 2024 && !!yearInReviewData.geographic_stats

  return (
    <div className="max-w-11/12 mx-auto my-0 w-11/12 2xl:w-[1400px] 2xl:max-w-[1400px]">
      <div className="space-y-8 py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 ms-auto">
            <span className="text-sm font-medium text-flathub-dark-gunmetal/70 dark:text-flathub-gainsborow/70">
              {t("year-in-review.select-year")}:
            </span>
            <div className="flex flex-wrap gap-2">
              {availableYears.slice(0, 8).map((y) => (
                <Link
                  key={y}
                  href={`/year-in-review/${y}`}
                  className={clsx(
                    "rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200",
                    y === year
                      ? "bg-flathub-celestial-blue text-white shadow-md"
                      : "bg-flathub-gainsborow/30 text-flathub-dark-gunmetal hover:bg-flathub-celestial-blue/20 dark:bg-flathub-arsenic/30 dark:text-flathub-gainsborow dark:hover:bg-flathub-celestial-blue/30",
                  )}
                >
                  {y}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <YearInReview
          year={yearInReviewData.year}
          totalDownloads={yearInReviewData.total_downloads}
          newAppsCount={yearInReviewData.new_apps_count}
          totalApps={yearInReviewData.total_apps}
          updatesCount={yearInReviewData.updates_count}
          totalDownloadsChange={yearInReviewData.total_downloads_change}
          totalDownloadsChangePercentage={
            yearInReviewData.total_downloads_change_percentage
          }
          hasPreviousYear={hasPreviousYear}
          topApps={yearInReviewData.top_apps}
          topGames={yearInReviewData.top_games}
          topEmulators={yearInReviewData.top_emulators}
          topGameStores={yearInReviewData.top_game_stores}
          topGameUtilities={yearInReviewData.top_game_utilities}
          popularAppsByCategory={yearInReviewData.popular_apps_by_category}
          biggestGrowthByCategory={yearInReviewData.biggest_growth_by_category}
          newcomersByCategory={yearInReviewData.newcomers_by_category}
          mostImprovedByCategory={yearInReviewData.most_improved_by_category}
          geographicStats={yearInReviewData.geographic_stats}
          hiddenGems={yearInReviewData.hidden_gems}
          platformStats={yearInReviewData.platform_stats}
          trendingCategories={yearInReviewData.trending_categories}
          hasGeographicData={hasGeographicData}
        />

        <div className="pt-4 text-center">
          <Link
            href="/"
            className="text-flathub-celestial-blue hover:text-flathub-electric-purple transition-colors"
          >
            <span className="inline-block rtl:rotate-180">←</span>{" "}
            {t("go-home")}
          </Link>
        </div>
      </div>
    </div>
  )
}
