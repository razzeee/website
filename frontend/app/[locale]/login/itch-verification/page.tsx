import { Suspense } from "react"
import Spinner from "src/components/Spinner"
import ItchVerificationCallback from "./verification-callback"

export default function ItchVerificationPage() {
  return (
    <Suspense fallback={<Spinner size="m" />}>
      <ItchVerificationCallback />
    </Suspense>
  )
}
