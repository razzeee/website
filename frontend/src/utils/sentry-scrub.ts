const sensitiveKeyPattern =
  /authorization|cookie|token|secret|password|passwd|apikey|privatekey|session|codeverifier|authorizationcode|oauthstate|csrf|signature|jwt|^state$/i
const sensitiveQueryKeyPattern =
  /(?:^code$|(?:authorization|cookie|token|secret|password|passwd|apikey|privatekey|session|state|codeverifier|signature|jwt))/i

const bearerCredentialPattern = /\b(Bearer|Basic)\s+[^\s,;]+/gi
const keyValueCredentialPattern =
  /(\b(?:access_token|refresh_token|id_token|token|client_secret|api[_-]?key|password|code_verifier|authorization_code)\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s&,;]+)/gi
const absoluteUrlPattern = /https?:\/\/[^\s"'<>]+/gi

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "")
  return sensitiveKeyPattern.test(normalized)
}

function scrubUrl(value: string): string {
  try {
    const url = new URL(value)
    url.username = ""
    url.password = ""
    url.hash = ""
    for (const key of url.searchParams.keys()) {
      if (
        sensitiveQueryKeyPattern.test(
          key.toLowerCase().replace(/[^a-z0-9]/g, ""),
        )
      ) {
        url.searchParams.set(key, "[Filtered]")
      }
    }
    return url.toString()
  } catch {
    return scrubText(value)
  }
}

function scrubText(value: string): string {
  return value
    .replace(bearerCredentialPattern, "$1 [Filtered]")
    .replace(keyValueCredentialPattern, "$1[Filtered]")
    .replace(absoluteUrlPattern, (url) => scrubUrl(url))
}

function scrubValue(value: unknown, key?: string): unknown {
  if (key && isSensitiveKey(key)) {
    return "[Filtered]"
  }

  if (typeof value === "string") {
    if (key?.toLowerCase().endsWith("url")) {
      return scrubUrl(value)
    }

    const trimmed = value.trimStart()
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return JSON.stringify(scrubValue(JSON.parse(value)))
      } catch {
        // Continue with inline redaction for non-JSON strings.
      }
    }
    return scrubText(value)
  }

  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item))
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        scrubValue(childValue, childKey),
      ]),
    )
  }

  return value
}

/** Redacts credential-like event fields and URL values before sending telemetry. */
export function scrubSentryPayload<T>(payload: T): T {
  return scrubValue(payload) as T
}
