export function safeSourceUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:"
  } catch {
    return false
  }
}

export function declarationAtPointer(
  manifest: unknown,
  pointer: string,
): unknown {
  if (!/^\/modules\/\d+(?:\/modules\/\d+)*(?:\/sources\/\d+)?$/.test(pointer)) {
    return undefined
  }
  let value = manifest
  for (const key of pointer.slice(1).split("/")) {
    if (
      value === null ||
      typeof value !== "object" ||
      !Object.hasOwn(value, key)
    ) {
      return undefined
    }
    value = (value as Record<string, unknown>)[key]
  }
  return value
}
