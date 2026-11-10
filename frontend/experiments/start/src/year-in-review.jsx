import { YearInReview } from "../../../src/components/application/YearInReview"
import { Link } from "./adapters/navigation"
import { PageTree } from "./page-tree"

export const yearComponents = { YearInReview, Link }

export default function YearPage({ tree }) {
  return <PageTree tree={tree} components={yearComponents} />
}
