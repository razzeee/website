import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const dependency = ["isomorphic", "dompurify"].join("-")
const DOMPurify = require(dependency)
export default DOMPurify
export const sanitize = DOMPurify.sanitize
