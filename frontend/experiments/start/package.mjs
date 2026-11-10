import {
  cp,
  mkdir,
  readdir,
  realpath,
  readFile,
  writeFile,
} from "node:fs/promises"
import { dirname, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

const root = dirname(fileURLToPath(import.meta.url))
const output = resolve(root, ".output")
await mkdir(resolve(output, "server/src"), { recursive: true })
await mkdir(resolve(output, "licenses"), { recursive: true })
await cp(
  resolve(root, "src/fonts/LICENSE"),
  resolve(output, "licenses/Inter.txt"),
)
for (const file of [
  "instrument.server.mjs",
  "invalidate.mjs",
  "src/cache.server.mjs",
  "src/cdn.server.mjs",
  "src/public-routes.mjs",
  "src/authorization.server.mjs",
]) {
  await cp(resolve(root, file), resolve(output, "server", file))
}

await cp(
  resolve(root, "../../src/i18n/locales.mjs"),
  resolve(output, "server/src/supported-locales.mjs"),
)
await cp(
  resolve(root, "../../src/utils/admin-access.mjs"),
  resolve(output, "server/src/admin-access.mjs"),
)
await writeFile(
  resolve(output, "server/src/authorization.server.mjs"),
  (
    await readFile(resolve(root, "src/authorization.server.mjs"), "utf8")
  ).replace("../../../src/utils/admin-access.mjs", "./admin-access.mjs"),
)
await writeFile(
  resolve(output, "server/src/locales.mjs"),
  (await readFile(resolve(root, "src/locales.mjs"), "utf8")).replace(
    "../../../src/i18n/locales.mjs",
    "./supported-locales.mjs",
  ),
)

// Reject dependencies that only work because the build checkout is present.
async function checkLinks(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isSymbolicLink()) {
      const target = relative(output, await realpath(path))
      if (target === ".." || target.startsWith(`..${sep}`)) {
        throw new Error(`External runtime link: ${relative(output, path)}`)
      }
    } else if (entry.isDirectory()) {
      await checkLinks(path)
    }
  }
}
await checkLinks(output)
console.log("Standalone runtime prepared in .output")
