import { GetStaticPaths, GetStaticProps } from "next"
import { serverSideTranslations } from "next-i18next/serverSideTranslations"

import ApplicationDetails from "../../src/components/application/Details"
import {
  fetchAppstream,
  fetchAppStats,
  fetchSummary,
  fetchDeveloperApps,
  fetchProjectgroupApps,
  fetchVerificationStatus,
  fetchEolRebase,
  fetchAddons,
} from "../../src/fetchers"
import { NextSeo } from "next-seo"
import {
  AddonAppstream,
  DesktopAppstream,
  pickScreenshot,
  Screenshot,
} from "../../src/types/Appstream"
import { Summary } from "../../src/types/Summary"
import { AppStats } from "../../src/types/AppStats"
import { VerificationStatus } from "src/types/VerificationStatus"
import {
  AppsIndex,
  MeilisearchResponse,
  removeAppIdFromSearchResponse,
} from "src/meilisearch"
import { Stats } from "src/types/Stats"

export default function Details({
  app,
  summary,
  stats,
  developerApps,
  projectgroupApps,
  verificationStatus,
  addons,
}: {
  app: DesktopAppstream
  summary?: Summary
  stats: AppStats
  developerApps: MeilisearchResponse<AppsIndex>
  projectgroupApps: MeilisearchResponse<AppsIndex>
  verificationStatus: VerificationStatus
  addons: AddonAppstream[]
}) {
  const screenshots = app.screenshots
    ? app.screenshots
        .filter((screenshot) => pickScreenshot(screenshot))
        .map((screenshot: Screenshot) => {
          const pickedScreenshot = pickScreenshot(screenshot)
          return {
            url: pickedScreenshot.src,
            alt: pickedScreenshot.caption,
          }
        })
    : []

  return (
    <>
      <NextSeo
        title={app?.name}
        description={app?.summary}
        openGraph={{
          url: `${process.env.NEXT_PUBLIC_SITE_BASE_URI}/apps/${app?.id}`,
          images: [
            ...screenshots,
            {
              url: app?.icon,
            },
          ],
        }}
      />
      <ApplicationDetails
        app={app}
        summary={summary}
        stats={stats}
        developerApps={developerApps}
        projectgroupApps={projectgroupApps}
        verificationStatus={verificationStatus}
        addons={addons}
      />
    </>
  )
}

export const getStaticProps: GetStaticProps = async ({
  locale,
  defaultLocale,
  params: { appDetails: appId },
}) => {
  console.log("Fetching data for app details: ", appId)

  const isFlatpakref = (appId as string).endsWith(".flatpakref")

  appId = isFlatpakref
    ? appId.slice(0, appId.length - ".flatpakref".length)
    : appId

  const eolRebaseTo = await fetchEolRebase(appId as string)

  if (eolRebaseTo) {
    const prefix = locale && locale !== defaultLocale ? `/${locale}` : ``

    return {
      redirect: {
        destination: isFlatpakref
          ? `${prefix}/apps/${eolRebaseTo}.flatpakref`
          : `${prefix}/apps/${eolRebaseTo}`,
        permanent: true,
      },
    }
  }

  if (isFlatpakref) {
    return {
      redirect: {
        destination: `https://dl.flathub.org/repo/appstream/${appId}.flatpakref`,
        permanent: true,
      },
    }
  }

  const app = (await fetchAppstream(appId as string)) as DesktopAppstream

  if (!app && app.type !== "desktop-application") {
    return {
      notFound: true,
    }
  }

  const summary = await fetchSummary(appId as string)
  const stats = await fetchAppStats(appId as string)
  const developerApps = await fetchDeveloperApps(app?.developer_name)
  const projectgroupApps = await fetchProjectgroupApps(app?.project_group)
  const verificationStatus = await fetchVerificationStatus(appId as string)
  const addons = await fetchAddons(appId as string)

  const addonStats = new Map<string, any>()

  for (const addon of addons) {
    const stats = await fetchAppStats(addon.id)
    addonStats[addon.id] = stats
  }

  addons.sort((a, b) => {
    return addonStats[b.id].installs_total - addonStats[a.id].installs_total
  })

  return {
    props: {
      ...(await serverSideTranslations(locale, ["common"])),
      app,
      summary,
      stats,
      developerApps: removeAppIdFromSearchResponse(developerApps, app.id),
      projectgroupApps: removeAppIdFromSearchResponse(projectgroupApps, app.id),
      verificationStatus,
      addons,
    },
    revalidate: 900,
  }
}

export const getStaticPaths: GetStaticPaths = async () => {
  return {
    paths: [],
    fallback: "blocking",
  }
}
