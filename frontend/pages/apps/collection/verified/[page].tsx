import { GetStaticPaths, GetStaticProps } from "next"
import { useTranslation } from "next-i18next"
import { serverSideTranslations } from "next-i18next/serverSideTranslations"
import { NextSeo } from "next-seo"
import ApplicationCollection from "../../../../src/components/application/Collection"
import { fetchCollectionVerified } from "../../../../src/fetchers"
import {
  AppsIndex,
  MeilisearchResponse,
  mapAppsIndexToAppstreamListItem,
} from "src/meilisearch"

export default function Verified({
  applications,
}: {
  applications: MeilisearchResponse<AppsIndex>
}) {
  const { t } = useTranslation()

  return (
    <>
      <NextSeo
        title={t("verified-apps")}
        openGraph={{
          url: `${process.env.NEXT_PUBLIC_SITE_BASE_URI}/apps/collection/verified`,
        }}
      />
      <div className="max-w-11/12 mx-auto my-0 mt-12 w-11/12 2xl:w-[1400px] 2xl:max-w-[1400px]">
        <ApplicationCollection
          title={t("verified-apps")}
          applications={applications.hits.map(mapAppsIndexToAppstreamListItem)}
          page={applications.page}
          totalPages={applications.totalPages}
          totalHits={applications.totalHits}
        />
      </div>
    </>
  )
}

export const getStaticProps: GetStaticProps = async ({ locale, params }) => {
  if (isNaN(params.page as unknown as number)) {
    return {
      notFound: true,
    }
  }

  const { data: applications } = await fetchCollectionVerified(
    params.page as unknown as number,
    30,
  )

  if (applications.page > applications.totalPages) {
    return {
      notFound: true,
    }
  }

  return {
    props: {
      ...(await serverSideTranslations(locale, ["common"])),
      applications,
    },
    revalidate: 900,
  }
}

export const getStaticPaths: GetStaticPaths = async () => {
  const { data: verified } = await fetchCollectionVerified(1, 30)

  const paths: { params: { page?: string } }[] = []
  for (let i = 1; i <= verified.totalPages; i++) {
    paths.push({ params: { page: i.toString() } })
  }

  return {
    paths: paths,
    fallback: "blocking",
  }
}
