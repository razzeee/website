import { createFileRoute } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { IntlProvider } from "use-intl"
import { lazy, Suspense } from "react"
import Spinner from "../../../../src/components/Spinner"
import ClientProviders from "../../../../app/client-providers"
import Main from "../../../../src/components/layout/Main"
import { publicComponents } from "../public-components"
import BuildsLayout from "../../../../app/[locale]/builds/layout"
import { protectedComponents, ProtectedPage } from "../protected-components"
const components = {
  ...publicComponents,
  ...protectedComponents,
  auth: lazy(() =>
    import("../auth-components").then((m) => ({ default: m.AuthPage })),
  ),
  unauthorized: lazy(() =>
    import("../auth-components").then((m) => ({ default: m.AuthPage })),
  ),
  settings: lazy(
    () =>
      import("../../../../app/[locale]/(protected)/settings/settings-client"),
  ),
  home: lazy(() => import("../../../../app/[locale]/home-client")),
  app: lazy(
    () => import("../../../../app/[locale]/apps/[appId]/app-detail-client"),
  ),
  category: lazy(
    () =>
      import("../../../../app/[locale]/apps/category/[category]/[page]/category-page-client"),
  ),
  about: lazy(() => import("../../../../app/[locale]/about/about-client")),
  search: lazy(
    () => import("../../../../app/[locale]/apps/search/search-client"),
  ),
}

const getPage = createServerFn({ method: "GET" })
  .validator((path) => {
    if (
      typeof path !== "string" ||
      !path.startsWith("/") ||
      path.startsWith("//") ||
      /[\r\n\\]/.test(path)
    ) {
      throw new Error("Invalid page path")
    }
    return path
  })
  .handler(async ({ data }) => {
    const { loadPage } = await import("../page.server")
    return loadPage(data)
  })
export const Route = createFileRoute("/$")({
  loaderDeps: ({ search }) => search,
  loader: ({ location }) =>
    getPage({ data: location.pathname + location.searchStr }),
  head: ({ loaderData: data }) => {
    if (!data) {
      return {}
    }
    return data.head
  },
  component: Page,
})
function Page() {
  const data = Route.useLoaderData()
  const Component = components[data.kind]
  const content = <Component {...data.props} />
  return (
    <IntlProvider locale={data.locale} messages={data.messages} timeZone="UTC">
      <ClientProviders locale={data.locale}>
        <Main>
          <Suspense fallback={<Spinner size="m" />}>
            {data.layout ? (
              <ProtectedPage layout={data.layout} locale={data.locale}>
                {content}
              </ProtectedPage>
            ) : data.kind.startsWith("builds") ? (
              <BuildsLayout>{content}</BuildsLayout>
            ) : (
              content
            )}
          </Suspense>
        </Main>
      </ClientProviders>
    </IntlProvider>
  )
}
