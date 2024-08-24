import Link from "next/link"
import { useTranslation } from "./i18n"

export default async function Page({ params: { locale } }) {
  const { t } = await useTranslation(locale)
  return (
    <>
      <h1>{t("title")}</h1>
      <Link href={`/${locale}/second-page`}>{t("publish-your-app")}</Link>
    </>
  )
}
