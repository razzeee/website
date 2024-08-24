// app/server-sitemap.xml/route.ts
import { getServerSideSitemap } from "next-sitemap"
import { fetchAppstreamList } from "src/fetchers"
import { languages } from "src/localize"

export async function GET(request: Request) {
  const appstreamList = await fetchAppstreamList()

  return getServerSideSitemap(
    appstreamList.map((appId, i) => ({
      loc: `${process.env.NEXT_PUBLIC_SITE_BASE_URI}/apps/${appId}`,
      // todo - add more fields here, maybe get lastmod from summary
      lastmod: new Date().toISOString(),
      alternateRefs: languages.map((lang) => ({
        href: `${process.env.NEXT_PUBLIC_SITE_BASE_URI}/${lang}/apps/${appId}`,
        hreflang: lang,
      })),
    })),
  )
}
