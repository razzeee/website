export const publicPages = {
  "year-in-review": () =>
    import("../../../app/[locale]/year-in-review/[year]/page"),
  builds: () => import("../../../app/[locale]/builds/page"),
  "builds-detail": () => import("../../../app/[locale]/builds/[id]/page"),
  "builds-app": () => import("../../../app/[locale]/builds/apps/[appId]/page"),
  "builds-reproducible": () =>
    import("../../../app/[locale]/builds/reproducible/page"),
  statistics: () => import("../../../app/[locale]/statistics/page"),
  bannerpreview: () =>
    import("../../../app/[locale]/apps/[appId]/bannerpreview/page"),
  "server-error": () => import("../../../app/[locale]/500/page"),
  unauthorized: () => import("../../../app/[locale]/unauthorized/page"),
  subcategory: () =>
    import("../../../app/[locale]/apps/category/[category]/subcategories/[subcategory]/[page]/page"),
  popular: () =>
    import("../../../app/[locale]/apps/collection/popular/[page]/page"),
  trending: () =>
    import("../../../app/[locale]/apps/collection/trending/[page]/page"),
  verified: () =>
    import("../../../app/[locale]/apps/collection/verified/[page]/page"),
  mobile: () =>
    import("../../../app/[locale]/apps/collection/mobile/[page]/page"),
  "recently-added": () =>
    import("../../../app/[locale]/apps/collection/recently-added/[page]/page"),
  "recently-updated": () =>
    import("../../../app/[locale]/apps/collection/recently-updated/[page]/page"),
  "developer-collection": () =>
    import("../../../app/[locale]/apps/collection/developer/[developer]/[page]/page"),
  tag: () =>
    import("../../../app/[locale]/apps/collection/tag/[tag]/[page]/page"),
  install: () => import("../../../app/[locale]/apps/[appId]/install/page"),
  setup: () => import("../../../app/[locale]/setup/page"),
  distro: () => import("../../../app/[locale]/setup/[distro]/page"),
  badges: () => import("../../../app/[locale]/badges/page"),
  feeds: () => import("../../../app/[locale]/feeds/page"),
  languages: () => import("../../../app/[locale]/languages/page"),
  consultants: () => import("../../../app/[locale]/consultants/page"),
  "privacy-policy": () => import("../../../app/[locale]/privacy-policy/page"),
  "terms-and-conditions": () =>
    import("../../../app/[locale]/terms-and-conditions/page"),
}
