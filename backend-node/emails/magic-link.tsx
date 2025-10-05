import { Button, Link, Text } from "@react-email/components"
import { format } from "date-fns"
import { Base } from "./base"

interface MagicLinkEmailProps {
  category: "magic_link"
  subject: string
  previewText: string
  magicLinkUrl: string
  expiresAt: string
}

export const MagicLinkEmail = ({
  category,
  subject,
  previewText,
  magicLinkUrl,
  expiresAt,
}: MagicLinkEmailProps) => {
  const formattedExpiry = format(expiresAt, "PPPPpppp")

  return (
    <Base previewText={previewText} subject={subject} category={category}>
      <Text>You requested a magic link to log in to Flathub.</Text>
      <Text className="-mt-4">
        Click the button below to securely log in to your account:
      </Text>
      <Button
        href={magicLinkUrl}
        style={{
          backgroundColor: "#4A90E2",
          color: "#ffffff",
          padding: "12px 20px",
          textDecoration: "none",
          borderRadius: "5px",
          display: "inline-block",
        }}
      >
        Log in to Flathub
      </Button>
      <Text className="-mt-4">
        Or copy and paste this URL into your browser:
      </Text>
      <Link href={magicLinkUrl}>{magicLinkUrl}</Link>
      <Text>
        <b>This link will expire at: </b>
        {formattedExpiry}
      </Text>
      <Text className="-mt-4">
        If you didn't request this link, you can safely ignore this email.
      </Text>
      <Text className="-mt-4">
        For security reasons, never share this link with anyone.
      </Text>
    </Base>
  )
}

MagicLinkEmail.PreviewProps = {
  subject: "Your Flathub login link",
  category: "magic_link",
  previewText: "Click to log in to Flathub",
  magicLinkUrl: "http://localhost:3000/login/magic-link?token=example-token",
  expiresAt: "2024-01-01T00:15:00Z",
} as MagicLinkEmailProps

export default MagicLinkEmail
