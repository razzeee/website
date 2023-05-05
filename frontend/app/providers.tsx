"use client"

import {
  MatomoProvider,
  createInstance,
  useMatomo,
} from "@jonkoops/matomo-tracker-react"
import { useTranslation } from "next-i18next"
import { DefaultSeo } from "next-seo"
import { ThemeProvider } from "next-themes"
import { useRouter } from "next/router"
import { useEffect } from "react"
import { UserInfoProvider } from "src/context/user-info"
import { IMAGE_BASE_URL, IS_PRODUCTION } from "src/env"
import { bcpToPosixLocale, languages } from "src/localize"

export function Providers({ children }) {
  const { t } = useTranslation()

  const router = useRouter()
  const instance = createInstance({
    urlBase: process.env.NEXT_PUBLIC_SITE_BASE_URI,
    siteId: Number(process.env.NEXT_PUBLIC_MATOMO_WEBSITE_ID) || 38,
    trackerUrl: "https://webstats.gnome.org/matomo.php",
    srcUrl: "https://webstats.gnome.org/matomo.js",
  })

  const { trackPageView } = useMatomo()

  // Track page view
  useEffect(() => {
    trackPageView({})
  }, [trackPageView])

  return (
    <MatomoProvider value={instance}>
      <ThemeProvider>
        <DefaultSeo
          dangerouslySetAllPagesToNoIndex={!IS_PRODUCTION}
          titleTemplate="%s | Flathub"
          defaultTitle="Flathub"
          description={t("flathub-description")}
          languageAlternates={languages.map((lang) => ({
            hrefLang: lang,
            href: `${process.env.NEXT_PUBLIC_SITE_BASE_URI}/${lang}`,
          }))}
          twitter={{
            site: "@FlatpakApps",
            cardType: "summary_large_image",
          }}
          openGraph={{
            type: "website",
            locale: bcpToPosixLocale(router.locale),
            url: process.env.NEXT_PUBLIC_SITE_BASE_URI,
            siteName: "Flathub",
            images: [
              {
                url: `${IMAGE_BASE_URL}card.webp`,
              },
            ],
          }}
        />
        <UserInfoProvider>{children}</UserInfoProvider>
      </ThemeProvider>
    </MatomoProvider>
  )
}
