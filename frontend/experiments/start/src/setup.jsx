import SetupClient from "../../../app/[locale]/setup/setup-client"

export default function Setup({ instructions, structuredData }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: structuredData }}
      />
      <SetupClient instructions={instructions} />
    </>
  )
}
