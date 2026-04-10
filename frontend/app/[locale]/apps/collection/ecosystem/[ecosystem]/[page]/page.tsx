import { notFound } from "next/navigation"
import { getEcosystemCollectionEcosystemEcosystemGet } from "../../../../../../../src/codegen"
import { Metadata } from "next"
import EcosystemCollectionClient from "./ecosystem-collection-client"
import { setRequestLocale } from "next-intl/server"

const ECOSYSTEM_NAMES: Record<string, string> = {
  gnome: "GNOME",
  kde: "KDE",
  freedesktop: "Freedesktop",
  elementary: "elementary",
}

interface Props {
  params: Promise<{
    ecosystem: string
    page: string
    locale: string
  }>
}

export const dynamic = "force-static"
export const revalidate = 3600

export async function generateStaticParams() {
  return []
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, ecosystem, page } = await params
  const name = ECOSYSTEM_NAMES[ecosystem] ?? ecosystem

  return {
    title: `${name} Apps on Flathub`,
    description: `Browse applications built for the ${name} ecosystem on Flathub`,
    alternates: {
      canonical: `${process.env.NEXT_PUBLIC_SITE_BASE_URI}/${locale}/apps/collection/ecosystem/${ecosystem}/${page}`,
    },
  }
}

export default async function EcosystemCollectionPage({ params }: Props) {
  const { locale, ecosystem, page } = await params

  setRequestLocale(locale)

  const pageNum = parseInt(page)

  if (isNaN(pageNum)) {
    notFound()
  }

  const name = ECOSYSTEM_NAMES[ecosystem]
  if (!name) {
    notFound()
  }

  const response = await getEcosystemCollectionEcosystemEcosystemGet(
    ecosystem,
    {
      page: pageNum,
      per_page: 30,
      locale,
    },
  )
  const applications = response.data

  if (applications.totalHits === 0 || applications.page > applications.totalPages) {
    notFound()
  }

  return (
    <EcosystemCollectionClient
      applications={applications}
      ecosystemName={name}
    />
  )
}
