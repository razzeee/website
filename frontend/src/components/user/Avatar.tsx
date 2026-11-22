import { getImageProps } from "next/image"
import { ImageWithPlaceholder } from "../ImageWithPlaceholder"
import { type FunctionComponent } from "react"
import FallbackAvatar from "boring-avatars"
import { useTranslations } from "next-intl"

interface Props {
  avatarUrl: string | null
  userName: string
}

const celestialBlue = "oklch(63.85% 0.1314 251.94)"
const variationTone = "oklch(83.88% 0.1014 201.73)"

const Avatar: FunctionComponent<Props> = (props: Props) => {
  const t = useTranslations()

  if (!props.userName) {
    return null
  }

  const { avatarUrl, userName } = props

  const fallback = (
    <FallbackAvatar
      size={38}
      name={userName}
      variant="marble"
      colors={[celestialBlue, variationTone]}
    />
  )
  if (!avatarUrl) {
    return fallback
  }

  const elementStyle = {
    className: "rounded-full",
    src: avatarUrl,
    width: 38,
    height: 38,
    alt: t("user-avatar", {
      user: userName,
    }),
  }

  // If the avatar is hosted on our own GitLab instance, we can't use the
  // optimized image loader because it will append image sizes to the URL
  // which KDE GitLab doesn't seem to like.
  const unoptimized = avatarUrl.startsWith("https://invent.kde.org/uploads/")
  const { props: image } = getImageProps({ ...elementStyle, unoptimized })
  const preview = unoptimized
    ? fallback
    : getImageProps({ ...elementStyle, width: 8, height: 8 }).props.src

  return <ImageWithPlaceholder key={avatarUrl} {...image} preview={preview} />
}

export default Avatar
