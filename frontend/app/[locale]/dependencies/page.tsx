import { Suspense } from "react"
import { getTranslations } from "next-intl/server"
import DependencySearch from "./search-client"

export async function generateMetadata() {
  const t = await getTranslations("dependency-index")
  return { title: t("title"), robots: { index: false } }
}

export default function DependenciesPage() {
  return (
    <Suspense>
      <DependencySearch />
    </Suspense>
  )
}
