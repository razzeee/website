import { notFound } from "next/navigation"
import {
  getDeveloperCollectionDeveloperDeveloperGet,
  getDeveloperSummaryCollectionDeveloperDeveloperSummaryGet,
} from "../../../../../../../src/codegen"
import { Metadata } from "next"
import DeveloperCollectionClient from "./developer-collection-client"
import { getTranslations, setRequestLocale } from "next-intl/server"

interface Props {
  params: Promise<{
    developer: string
    page: string
    locale: string
  }>
}

export const dynamic = "force-static"
export const revalidate = 3600 // Revalidate every hour

export async function generateStaticParams() {
  return []
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, developer, page } = await params
  const t = await getTranslations({ locale })
  const developerDecoded = decodeURIComponent(developer)

  let description: string | undefined
  try {
    const summary =
      await getDeveloperSummaryCollectionDeveloperDeveloperSummaryGet(developer)
    description = `${summary.data.total_apps} apps on Flathub with ${summary.data.total_installs.toLocaleString("en")} installs last month`
  } catch {
    // Summary may not be available
  }

  return {
    title: t("apps-by-developer", { developer: developerDecoded }),
    description,
    alternates: {
      canonical: `${process.env.NEXT_PUBLIC_SITE_BASE_URI}/${locale}/apps/collection/developer/${developer}/${page}`,
    },
  }
}

export default async function DeveloperCollectionPage({ params }: Props) {
  const { locale, developer, page } = await params

  // Enable static rendering
  setRequestLocale(locale)

  const pageNum = parseInt(page)

  if (isNaN(pageNum)) {
    notFound()
  }

  const developerDecoded = decodeURIComponent(developer)

  const [response, summaryResponse] = await Promise.all([
    getDeveloperCollectionDeveloperDeveloperGet(developer, {
      page: pageNum,
      per_page: 30,
      locale,
    }),
    getDeveloperSummaryCollectionDeveloperDeveloperSummaryGet(
      developer,
    ).catch(() => null),
  ])

  const applications = response.data
  const summary = summaryResponse?.data ?? null

  if (applications.page > applications.totalPages) {
    notFound()
  }

  return (
    <DeveloperCollectionClient
      applications={applications}
      developer={developerDecoded}
      summary={summary}
    />
  )
}
