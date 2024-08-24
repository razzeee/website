"use client"

import {
  createInstance,
  MatomoProvider,
} from "@mitresthen/matomo-tracker-react"
import { DefaultSeo } from "next-seo"
import { ThemeProvider } from "next-themes"

import "react-toastify/dist/ReactToastify.css"
import { ToastContainer } from "react-toastify"

import "../../styles/main.scss"

import { Inter } from "next/font/google"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MotionConfig } from "framer-motion"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"

import cardImage from "/public/img/card.webp"
import { ReactNode, useState } from "react"
import { setDefaultOptions } from "date-fns"
import axios from "axios"
import { dir } from "i18next"
import { useTranslation } from "./i18n/client"
import { bcpToPosixLocale, getLocale, languages } from "src/localize"
import { UserInfoProvider } from "src/context/user-info"
import { IS_PRODUCTION } from "src/env"
import Main from "./main"

const inter = Inter({
  subsets: ["latin"],
  fallback: ["sans-serif"],
})

export default function ClientLayout({
  children,
  locale,
}: {
  children: ReactNode
  locale: string
}) {
  const { t } = useTranslation(locale)

  setDefaultOptions({ locale: getLocale(locale) })

  const [queryClient] = useState(() => new QueryClient({}))

  axios.interceptors.request.use((config) => {
    return {
      ...config,
      baseURL: process.env.NEXT_PUBLIC_API_BASE_URI,
    }
  })

  const instance = createInstance({
    urlBase: process.env.NEXT_PUBLIC_SITE_BASE_URI || "",
    siteId: Number(process.env.NEXT_PUBLIC_MATOMO_WEBSITE_ID) || 38,
    trackerUrl: "https://webstats.gnome.org/matomo.php",
    srcUrl: "https://webstats.gnome.org/matomo.js",
    configurations: {
      disableCookies: true,
    },
  })

  return (
    <MatomoProvider value={instance}>
      <ThemeProvider attribute="class">
        <DefaultSeo
          dangerouslySetAllPagesToNoIndex={!IS_PRODUCTION}
          titleTemplate="%s | Flathub"
          defaultTitle={t("flathub-apps-for-linux")}
          description={t("flathub-description")}
          languageAlternates={languages
            .filter((lang) => lang !== locale)
            .map((lang) => ({
              hrefLang: lang,
              href: `${process.env.NEXT_PUBLIC_SITE_BASE_URI}/${lang}`,
            }))}
          twitter={{
            cardType: "summary_large_image",
          }}
          openGraph={{
            type: "website",
            locale: bcpToPosixLocale(locale),
            url: process.env.NEXT_PUBLIC_SITE_BASE_URI,
            siteName: t("flathub-apps-for-linux"),
            images: [
              {
                url: cardImage.src,
              },
            ],
          }}
        />
        <MotionConfig reducedMotion="user">
          <QueryClientProvider client={queryClient}>
            <UserInfoProvider>
              <style jsx global>{`
                html {
                  font-family: ${inter.style.fontFamily};
                }
              `}</style>
              <Main lng={locale}>{children}</Main>
            </UserInfoProvider>
            <ToastContainer
              position={dir(locale) === "rtl" ? "bottom-left" : "bottom-right"}
              rtl={dir(locale) === "rtl"}
            />
            <ReactQueryDevtools initialIsOpen={false} />
          </QueryClientProvider>
        </MotionConfig>
      </ThemeProvider>
    </MatomoProvider>
  )
}
