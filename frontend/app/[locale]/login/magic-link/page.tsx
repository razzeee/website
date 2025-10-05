import { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"
import { Suspense } from "react"
import Spinner from "src/components/Spinner"
import MagicLinkClient from "./magic-link-client"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale })

  return {
    title: t("login-with-magic-link"),
    robots: {
      index: false,
    },
  }
}

export default async function MagicLinkPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  // Enable static rendering
  setRequestLocale(locale)

  return (
    <Suspense fallback={<Spinner size={"m"} />}>
      <MagicLinkClient />
    </Suspense>
  )
}
