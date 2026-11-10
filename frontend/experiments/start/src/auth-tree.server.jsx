import { authComponents } from "./auth-components"
import { serializePageTree } from "./page-tree"

export function serializeAuthTree(node) {
  return serializePageTree(node, authComponents)
}
