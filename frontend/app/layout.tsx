import { Providers } from "./providers"

import { Inter } from "next/font/google"
import { ToastContainer } from "react-toastify"
import Header from "./header"
import Footer from "./footer"
const inter = Inter({
  subsets: ["latin"],
})

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html suppressHydrationWarning>
      <head>
        <base href="/" />

        <link rel="icon" href="/favicon.svg" sizes="any" type="image/svg+xml" />
        <link rel="icon" href="/favicon.png" type="image/png" />

        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="./apple-touch-icon.png"
        />
      </head>
      <body>
        <Providers>
          <div
            className={`${inter.className} flex min-h-screen flex-col bg-flathub-white dark:bg-flathub-dark-gunmetal`}
          >
            <Header />

            <main className="pt-16">{children}</main>

            <Footer />
          </div>
          <ToastContainer position="bottom-right" />
        </Providers>
      </body>
    </html>
  )
}
