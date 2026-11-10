import { lazy } from "react"

export const publicComponents = {
  "year-in-review": lazy(() => import("./year-in-review")),
  builds: lazy(() => import("../../../app/[locale]/builds/builds-client")),
  "builds-detail": lazy(
    () => import("../../../app/[locale]/builds/[id]/build-detail-client"),
  ),
  "builds-app": lazy(
    () =>
      import("../../../app/[locale]/builds/apps/[appId]/app-build-status-client"),
  ),
  "builds-reproducible": lazy(
    () =>
      import("../../../app/[locale]/builds/reproducible/reproducible-client"),
  ),
  statistics: lazy(
    () => import("../../../app/[locale]/statistics/statistics-client"),
  ),
  bannerpreview: lazy(
    () =>
      import("../../../app/[locale]/apps/[appId]/bannerpreview/bannerpreview-client"),
  ),
  "server-error": lazy(
    () => import("../../../app/[locale]/500/server-error-client"),
  ),
  subcategory: lazy(
    () =>
      import("../../../app/[locale]/apps/category/[category]/subcategories/[subcategory]/[page]/subcategory-page-client"),
  ),
  popular: lazy(
    () =>
      import("../../../app/[locale]/apps/collection/popular/[page]/popular-collection-client"),
  ),
  trending: lazy(
    () =>
      import("../../../app/[locale]/apps/collection/trending/[page]/trending-collection-client"),
  ),
  verified: lazy(
    () =>
      import("../../../app/[locale]/apps/collection/verified/[page]/verified-collection-client"),
  ),
  mobile: lazy(
    () =>
      import("../../../app/[locale]/apps/collection/mobile/[page]/mobile-collection-client"),
  ),
  "recently-added": lazy(
    () =>
      import("../../../app/[locale]/apps/collection/recently-added/[page]/recently-added-collection-client"),
  ),
  "recently-updated": lazy(
    () =>
      import("../../../app/[locale]/apps/collection/recently-updated/[page]/recently-updated-collection-client"),
  ),
  "developer-collection": lazy(
    () =>
      import("../../../app/[locale]/apps/collection/developer/[developer]/[page]/developer-collection-client"),
  ),
  tag: lazy(
    () =>
      import("../../../app/[locale]/apps/collection/tag/[tag]/[page]/tag-collection-client"),
  ),
  install: lazy(
    () => import("../../../app/[locale]/apps/[appId]/install/client"),
  ),
  setup: lazy(() => import("./setup")),
  distro: lazy(
    () => import("../../../app/[locale]/setup/[distro]/distro-setup-client"),
  ),
  badges: lazy(() => import("../../../app/[locale]/badges/badges-client")),
  feeds: lazy(() => import("../../../app/[locale]/feeds/feeds-client")),
  languages: lazy(
    () => import("../../../app/[locale]/languages/languages-client"),
  ),
  consultants: lazy(
    () => import("../../../app/[locale]/consultants/consultants-client"),
  ),
  "privacy-policy": lazy(
    () => import("../../../app/[locale]/privacy-policy/privacy-policy-client"),
  ),
  "terms-and-conditions": lazy(
    () =>
      import("../../../app/[locale]/terms-and-conditions/terms-and-conditions-client"),
  ),
}
