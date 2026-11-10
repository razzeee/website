import { createHash, randomUUID } from "node:crypto"
import { createClient } from "redis"
import { promisify } from "node:util"
import { zstdCompress, zstdDecompress } from "node:zlib"
import { setTimeout as delay } from "node:timers/promises"
import { isLocale, withoutLocale } from "./locales.mjs"
import { matchPublicRoute } from "./public-routes.mjs"
import { protectedRoute } from "./authorization.server.mjs"

const compress = promisify(zstdCompress)
const decompress = promisify(zstdDecompress)
export const publicPage = (path) => {
  if (protectedRoute(path)) {
    return false
  }
  if (!isLocale(path.split("/")[1]) || /[?#]/.test(path)) {
    return false
  }
  const localPath = withoutLocale(path)
  const route = matchPublicRoute(localPath.slice(1).split("/"))
  if (route) {
    return (
      ![
        "install",
        "bannerpreview",
        "server-error",
        "unauthorized",
        "year-in-review",
      ].includes(route.kind) &&
      !route.kind.startsWith("builds") &&
      (!route.params.page || /^[1-9][0-9]*$/.test(route.params.page))
    )
  }
  return (
    /^(?:\/|\/about|\/apps\/(?:[A-Za-z0-9_.-]+|category\/[a-z]+\/[1-9][0-9]*))$/.test(
      localPath,
    ) && localPath !== "/apps/search"
  )
}
export const cacheableRequest = (request) => {
  const url = new URL(request.url)
  return (
    request.method === "GET" &&
    publicPage(url.pathname) &&
    !url.search &&
    !(request.headers.get("cookie") || "")
      .split(";")
      .some(
        (cookie) =>
          cookie.trim() && cookie.trim().split("=")[0] !== "NEXT_LOCALE",
      ) &&
    !request.headers.has("authorization") &&
    !request.headers.has("range") &&
    !request.headers.has("x-tsr-redirect")
  )
}

export function createPageCache({
  url,
  namespace,
  freshMs = 3600000,
  staleMs = 0,
  lockMs = 30000,
  onError = console.error,
}) {
  const client = createClient({
    url,
    disableOfflineQueue: true,
    socket: { connectTimeout: 500, reconnectStrategy: false },
  })
  client.on("error", onError)
  let connection
  const connect = async () => {
    if (!client.isOpen) {
      connection ??= client.connect().finally(() => {
        connection = undefined
      })
      await connection
    }
  }
  const command = async (fn) => {
    await connect()
    let timeout
    try {
      return await Promise.race([
        fn(),
        new Promise((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("Page cache timeout")),
            500,
          )
        }),
      ])
    } finally {
      clearTimeout(timeout)
    }
  }
  const prefix = `start:${namespace}:`
  const hash = (value) => createHash("sha256").update(value).digest("hex")
  const generationKey = (path) => `${prefix}generation:${hash(path)}`
  const pending = new Set()
  async function cached(path, representation, producer) {
    let produced
    const produce = () => (produced ??= Promise.resolve().then(producer))
    let generation, key, lock
    try {
      generation = (await command(() => client.get(generationKey(path)))) || "0"
      key = `${prefix}${hash(path)}:${generation}:${representation}`
      const stored = await command(() => client.get(key))
      if (stored) {
        const entry = JSON.parse(
          (await decompress(Buffer.from(stored, "base64"))).toString(),
        )
        if (Date.now() < entry.freshUntil) {
          return { value: entry.value, state: "HIT" }
        }
        if (staleMs > 0) {
          const task = refresh()
            .catch(onError)
            .finally(() => pending.delete(task))
          pending.add(task)
          return { value: entry.value, state: "STALE" }
        }
      }
      return await refresh()
    } catch (error) {
      onError(error)
      return { value: await produce(), state: "BYPASS" }
    }

    async function refresh() {
      lock = `${key}:lock`
      const token = randomUUID()
      const acquired = await command(() =>
        client.set(lock, token, { NX: true, PX: lockMs }),
      )
      if (!acquired) {
        // Bound contention waiting; an expired lease must never overwrite a newer render.
        for (let attempt = 0; attempt < 100; attempt++) {
          await delay(25)
          const stored = await command(() => client.get(key))
          if (stored) {
            const entry = JSON.parse(
              (await decompress(Buffer.from(stored, "base64"))).toString(),
            )
            if (Date.now() < entry.freshUntil) {
              return { value: entry.value, state: "HIT" }
            }
          }
        }
        return { value: await produce(), state: "BYPASS" }
      }
      try {
        const value = await produce()
        if (value !== null) {
          const stored = (
            await compress(
              Buffer.from(
                JSON.stringify({ value, freshUntil: Date.now() + freshMs }),
              ),
            )
          ).toString("base64")
          await command(() =>
            client.eval(
              "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('SET', KEYS[2], ARGV[2], 'PX', ARGV[3]) end return 0",
              {
                keys: [lock, key],
                arguments: [token, stored, String(freshMs + staleMs)],
              },
            ),
          )
        }
        return { value, state: "MISS" }
      } finally {
        await command(() =>
          client.eval(
            "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0",
            { keys: [lock], arguments: [token] },
          ),
        )
      }
    }
  }
  return {
    cached,
    invalidate: (path) => command(() => client.incr(generationKey(path))),
    async close() {
      await Promise.allSettled([...pending])
      if (client.isOpen) {
        await client.quit()
      }
    },
  }
}

let shared
export function pageCache() {
  if (!process.env.REDIS_URL) {
    return undefined
  }
  if (!shared) {
    shared = createPageCache({
      url: process.env.REDIS_URL,
      namespace: process.env.GITHUB_SHA || "prototype-v2",
    })
    for (const signal of ["SIGTERM", "SIGINT"]) {
      process.once(signal, () => {
        void shared.close().catch(console.error)
      })
    }
  }
  return shared
}
