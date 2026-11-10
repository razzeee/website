import { Suspense } from "react"
import { Link } from "./adapters/navigation"
import Image from "./adapters/image"
import Spinner from "../../../src/components/Spinner"
import LoginClient from "../../../app/[locale]/login/login-client"
import EmailConfirmClient from "../../../app/[locale]/login/email/confirm/email-confirm-client"
import LoginServiceClient from "../../../app/[locale]/login/[service]/login-service-client"
import { PageTree } from "./page-tree"

export const authComponents = {
  Suspense,
  Link,
  Image,
  Spinner,
  LoginClient,
  EmailConfirmClient,
  LoginServiceClient,
}
export function AuthPage({ tree }) {
  return <PageTree tree={tree} components={authComponents} />
}
