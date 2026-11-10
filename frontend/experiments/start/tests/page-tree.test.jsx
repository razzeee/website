import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { PageTree, serializePageTree } from "../src/page-tree"

function Example({ values }) {
  return (
    <section>
      {values.map((value) => (
        <p key={value.id}>{value.title}</p>
      ))}
    </section>
  )
}

describe("bounded page tree transport", () => {
  it("preserves server scaffolding, navigation and plain component props", () => {
    const components = { Example }
    const original = (
      <div className="page">
        <nav>
          <a href="#year-2025" aria-current="page">
            2025
          </a>
        </nav>
        <Example values={[{ id: 1, title: "A < B" }]} />
        <span aria-hidden="true">←</span>
      </div>
    )
    const tree = serializePageTree(original, components)
    expect(
      renderToStaticMarkup(<PageTree tree={tree} components={components} />),
    ).toBe(renderToStaticMarkup(original))
  })

  it("rejects components not explicitly registered for the page", () => {
    expect(() => serializePageTree(<Example values={[]} />, {})).toThrow(
      "Unsupported page tree component",
    )
  })
})
