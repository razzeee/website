import { isValidElement } from "react"

export function serializePageTree(node, components) {
  const serialize = (value) => {
    if (Array.isArray(value)) {
      return value.map(serialize)
    }
    if (!isValidElement(value)) {
      return value
    }
    const component = typeof value.type !== "string"
    const type = component
      ? Object.keys(components).find((name) => components[name] === value.type)
      : value.type
    if (!type) {
      throw new Error("Unsupported page tree component")
    }
    return {
      element: true,
      type,
      component,
      key: value.key,
      props: Object.fromEntries(
        Object.entries(value.props).map(([key, prop]) => [
          key,
          serialize(prop),
        ]),
      ),
    }
  }
  return serialize(node)
}

export function PageTree({ tree, components }) {
  const render = (node) => {
    if (Array.isArray(node)) {
      return node.map(render)
    }
    if (node === null || typeof node !== "object" || !node.element) {
      return node
    }
    const Component = node.component ? components[node.type] : node.type
    const props = Object.fromEntries(
      Object.entries(node.props).map(([key, value]) => [key, render(value)]),
    )
    return <Component key={node.key} {...props} />
  }
  return render(tree)
}
