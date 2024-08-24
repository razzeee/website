// app/server-sitemap-index.xml/route.ts
import { getServerSideSitemapIndex } from "next-sitemap"

export async function GET(request: Request) {
  return getServerSideSitemapIndex([
    `${process.env.NEXT_PUBLIC_SITE_BASE_URI}/app-sitemap.xml`,
  ])
}
