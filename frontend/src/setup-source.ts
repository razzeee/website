import { readFileSync } from "node:fs"
import { parse } from "yaml"
import type { DistroDefinition } from "./setup-messages"

// Node-only authoring input; browser code imports the generated catalog instead.
export function readSetupDefinitions(): DistroDefinition[] {
  return parseSetupDefinitions(
    readFileSync(new URL("./data/distro.yml", import.meta.url), "utf8"),
  )
}

export function parseSetupDefinitions(source: string): DistroDefinition[] {
  const definitions: unknown = parse(source)
  if (!Array.isArray(definitions)) {
    throw new Error("Setup YAML must contain a list of distro definitions")
  }

  function record(
    value: unknown,
    path: string,
  ): asserts value is Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`${path} must be a mapping`)
    }
  }
  function text(value: unknown, path: string) {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`${path} must be a non-empty string`)
    }
  }
  function block(value: unknown, path: string, step = false) {
    record(value, path)
    for (const key of ["translationKey", "text", ...(step ? ["name"] : [])]) {
      text(value[key], `${path}.${key}`)
    }
    if (
      value.textTag !== undefined &&
      !["p", "h2"].includes(value.textTag as string)
    ) {
      throw new Error(`${path}.textTag must be p or h2`)
    }
    if (value.commands !== undefined) {
      record(value.commands, `${path}.commands`)
      for (const [tag, command] of Object.entries(value.commands)) {
        text(command, `${path}.commands.${tag}`)
      }
    }
    if (value.links !== undefined) {
      record(value.links, `${path}.links`)
      for (const [tag, link] of Object.entries(value.links)) {
        record(link, `${path}.links.${tag}`)
        text(link.href, `${path}.links.${tag}.href`)
        if (link.text !== undefined)
          text(link.text, `${path}.links.${tag}.text`)
      }
    }
  }
  for (const [index, distro] of definitions.entries()) {
    const path = `Distro ${index + 1}`
    record(distro, path)
    for (const key of ["name", "displayName", "logo", "translationKey"]) {
      text(distro[key], `${path}.${key}`)
    }
    for (const key of ["slug", "logo_dark"]) {
      if (distro[key] !== undefined) text(distro[key], `${path}.${key}`)
    }
    if (
      distro.priority !== undefined &&
      (typeof distro.priority !== "number" || !Number.isFinite(distro.priority))
    ) {
      throw new Error(`${path}.priority must be a finite number`)
    }
    if (distro.introduction !== undefined)
      block(distro.introduction, `${path}.introduction`)
    if (!Array.isArray(distro.steps))
      throw new Error(`${path}.steps must be a list`)
    for (const [index, step] of distro.steps.entries()) {
      block(step, `${path}.steps[${index}]`, true)
    }
  }
  return definitions as DistroDefinition[]
}
