import { AsyncLocalStorage } from "node:async_hooks"
import { createTranslator } from "use-intl/core"
import deepmerge from "deepmerge"
import common from "../../../../public/locales/en/common.json"
import distros from "../../../../public/locales/en/distros.json"

const scope = new AsyncLocalStorage()
const catalogs = import.meta.glob("../../../../public/locales/*/*.json")
export async function withLocale(locale, callback) {
  const base = "../../../../public/locales/" + locale
  const extra = await catalogs[`${base}/common.json`]?.()
  const distro = await catalogs[`${base}/distros.json`]?.()
  const messages = deepmerge(
    { ...common, distros },
    { ...extra?.default, distros: distro?.default || {} },
  )
  return scope.run({ locale, messages }, () => callback(messages))
}
export async function getTranslations(namespace) {
  if (namespace && typeof namespace === "object") {
    return withLocale(
      namespace.locale || scope.getStore()?.locale || "en",
      () =>
        createTranslator({
          ...scope.getStore(),
          namespace: namespace.namespace,
        }),
    )
  }
  return createTranslator({ ...scope.getStore(), namespace })
}
export async function getLocale() {
  return scope.getStore().locale
}
