import { Suspense } from "react"
import { notFound } from "next/navigation"
import ManifestView from "./manifest-client"

export const metadata = { robots: { index: false } }

export default async function ManifestPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!/^[1-9]\d{0,9}$/.test(id) || Number(id) > 2147483647) {
    notFound()
  }
  return (
    <Suspense>
      <ManifestView id={Number(id)} />
    </Suspense>
  )
}
