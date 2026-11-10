import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useLocation,
} from "@tanstack/react-router"
import { getLangDir } from "rtl-detect"
import "../../../../styles/main.css"
import "../fonts.css"

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
    ],
  }),
  component: Root,
})
function Root() {
  const locale = useLocation({
    select: (location) => location.pathname.split("/")[1] || "en",
  })
  return (
    <html lang={locale} dir={getLangDir(locale)} suppressHydrationWarning>
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
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
