import { dir } from "i18next"
import { languages } from "src/localize"
import ClientLayout from "./ClientLayout"

export async function generateStaticParams() {
  return languages.map((locale) => ({ locale }))
}

export default function RootLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode
  params: { locale: string }
}) {
  console.log("locale", locale)

  return (
    <html lang={locale} dir={dir(locale)}>
      <head />
      <body>
        <ClientLayout locale={locale}>{children}</ClientLayout>
      </body>
    </html>
  )
}
