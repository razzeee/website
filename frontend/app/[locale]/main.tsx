import { useEffect } from "react"

import { useMatomo } from "@mitresthen/matomo-tracker-react"
import Header from "./header"
import Footer from "./footer"

const Main = ({
  children,
  lng,
}: {
  children: React.ReactNode
  lng: string
}) => {
  const { trackPageView } = useMatomo()

  // Track page view
  useEffect(() => {
    trackPageView({
      href: window.location.href.replace(RegExp(`/${lng}$|/${lng}/`), "/"),
      customDimensions: [
        {
          id: 1,
          value: lng,
        },
      ],
    })
  })

  return (
    <div
      className={`flex min-h-screen flex-col bg-flathub-lotion dark:bg-flathub-dark-gunmetal`}
    >
      <Header lng={lng} />

      <main className="pt-[68px]">{children}</main>

      <Footer lng={lng} />
    </div>
  )
}

export default Main
