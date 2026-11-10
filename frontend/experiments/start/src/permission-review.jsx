import ModerationGuard from "../../../src/components/moderation/ModerationGuard"
import PermissionReviewDetail from "../../../src/components/moderation/PermissionReviewDetail"

export default function PermissionReview(props) {
  return (
    <ModerationGuard>
      <PermissionReviewDetail {...props} />
    </ModerationGuard>
  )
}
