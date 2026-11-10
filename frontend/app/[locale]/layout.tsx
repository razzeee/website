import { ReactNode } from "react"
import { Inter } from "next/font/google"
import { getLangDir } from "rtl-detect"
import "../../styles/main.css"
import "src/utils/axios-config"
import ClientProviders from "../client-providers"
import Main from "../../src/components/layout/Main"
import { NextIntlClientProvider } from "next-intl"

import { getDateFnsLocale } from "src/localize"
import { getLocale } from "next-intl/server"
import { staticLocales } from "src/i18n/static-locales"

const inter = Inter({
  subsets: ["latin"],
  fallback: ["sans-serif"],
  preload: false,
})

export function generateStaticParams() {
  return staticLocales.map((locale) => ({ locale }))
}

export { generateMetadata } from "./metadata"

export default async function LocaleLayout({
  children,
}: {
  children: ReactNode
}) {
  const locale = await getLocale()

  return (
    <html suppressHydrationWarning lang={locale} dir={getLangDir(locale)}>
      <head>
        <link rel="preconnect" href="https://dl.flathub.org" />
        <link rel="preconnect" href="https://webstats.gnome.org" />
        <link rel="preconnect" href="https://imgproxy.flathub.org" />
        <link
          rel="alternate"
          type="application/rss+xml"
          title="Flathub – New Apps"
          href="/feed/new"
        />
        <link
          rel="alternate"
          type="application/rss+xml"
          title="Flathub – Recently Updated Apps"
          href="/feed/recently-updated"
        />
      </head>
      <body className={inter.className}>
        <NextIntlClientProvider>
          <ClientProviders locale={locale}>
            <Main>{children}</Main>
          </ClientProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
