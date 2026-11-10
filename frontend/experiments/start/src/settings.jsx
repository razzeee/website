import ProtectedLayout from "../../../app/[locale]/(protected)/protected-layout-client"
import SettingsClient from "../../../app/[locale]/(protected)/settings/settings-client"

export default function Settings(props) {
  return (
    <ProtectedLayout>
      <SettingsClient {...props} />
    </ProtectedLayout>
  )
}
