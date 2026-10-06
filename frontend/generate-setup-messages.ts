import { readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { format, resolveConfig } from "prettier"
import {
  generateSetupMessages,
  generateSetupCatalog,
} from "./src/setup-messages"
import { readSetupDefinitions } from "./src/setup-source"

async function main() {
  const args = process.argv.slice(2)
  if (args.some((arg) => arg !== "--check")) {
    throw new Error("Usage: tsx generate-setup-messages.ts [--check]")
  }
  const definitions = readSetupDefinitions()
  const output = new URL("./public/locales/en/distros.json", import.meta.url)
  const catalog = new URL(
    "./src/data/distro-setup.generated.json",
    import.meta.url,
  )
  const messages =
    JSON.stringify(generateSetupMessages(definitions), null, 2) + "\n"
  const runtime = await format(
    JSON.stringify(generateSetupCatalog(definitions)),
    {
      ...(await resolveConfig(fileURLToPath(catalog))),
      filepath: fileURLToPath(catalog),
    },
  )
  for (const [file, generated] of [
    [output, messages],
    [catalog, runtime],
  ] as const) {
    if (args.includes("--check")) {
      const current = await readFile(file, "utf8")
      if (current !== generated) {
        throw new Error(
          `${fileURLToPath(file)} is out of date. Edit src/data/distro.yml, run pnpm generate:setup-messages, and commit both generated JSON files.`,
        )
      }
    } else {
      await writeFile(file, generated)
      console.log(`Generated ${fileURLToPath(file)}`)
    }
  }
  if (args.includes("--check"))
    console.log("Generated setup messages and catalog are up to date.")
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
