import { spawn } from "node:child_process"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { createSandbox } from "../../../scripts/benchmark/sandbox.mjs"

if (!process.env.REDIS_URL) {
  throw new Error("Provide a dedicated REDIS_URL for the cache tests")
}
const root = fileURLToPath(new URL("../", import.meta.url))
const directory = await mkdtemp(join(tmpdir(), "flathub-start-tests-"))
const sandbox = createSandbox(directory)
try {
  await new Promise((resolve, reject) => {
    sandbox.once("error", reject)
    sandbox.listen(4101, "127.0.0.1", resolve)
  })
  const tests = (await readdir(new URL("./", import.meta.url)))
    .filter((file) => file.endsWith(".check.mjs"))
    .map((file) => `tests/${file}`)
  const child = spawn(
    process.execPath,
    ["--import", "./instrument.server.mjs", "--test", ...tests],
    {
      cwd: root,
      env: { ...process.env, SENTRY_DSN: "http://public@127.0.0.1:4101/1" },
      stdio: "inherit",
    },
  )
  process.exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject)
    child.once("exit", (code) => resolve(code ?? 1))
  })
} finally {
  await new Promise((resolve) => sandbox.close(resolve))
  await rm(directory, { recursive: true })
}
