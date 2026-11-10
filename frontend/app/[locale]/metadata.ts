import type { Metadata } from "next"
import { getLocale, getTranslations } from "next-intl/server"
import { bcpToPosixLocale } from "src/localize"
import { IS_PRODUCTION, ASSET_BASE_URL } from "src/env"
import cardImage from "../../public/img/card.webp"

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  const t = await getTranslations()
  return {
    metadataBase: new URL(
      process.env.NEXT_PUBLIC_SITE_BASE_URI || "https://flathub.org",
    ),
    robots: {
      index: locale === "en-GB" ? false : IS_PRODUCTION,
      follow: IS_PRODUCTION,
    },
    title: {
      template: `%s | ${t("flathub")}`,
      default: t("flathub-apps-for-linux"),
    },
    description: t("flathub-description"),
    icons: {
      icon: [
        {
          url: `${ASSET_BASE_URL}/favicon.svg`,
          type: "image/svg+xml",
          sizes: "any",
        },
        { url: `${ASSET_BASE_URL}/favicon.png`, type: "image/png" },
      ],
      apple: `${ASSET_BASE_URL}/apple-touch-icon.png`,
    },
    twitter: { card: "summary_large_image" },
    openGraph: {
      type: "website",
      locale: bcpToPosixLocale(locale),
      siteName: t("flathub-apps-for-linux"),
      images: [{ url: cardImage.src }],
    },
  }
}
