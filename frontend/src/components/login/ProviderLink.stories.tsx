import React from "react"
import { Meta, StoryObj } from "@storybook/nextjs-vite"
import ProviderLink from "./ProviderLink"
import { LoginMethod } from "../../codegen"
import { HttpResponse, http } from "msw"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"

const meta = {
  title: "Components/Login/ProviderLink",
  component: ProviderLink,
  parameters: {
    nextjs: {
      appDirectory: true,
    },
  },
} satisfies Meta<typeof ProviderLink>

export default meta
type Story = StoryObj<typeof meta>
const replace = fn()

export const github = () => {
  const provider: LoginMethod = {
    method: "github",
    name: "GitHub",
  }

  return <ProviderLink provider={provider} />
}

export const gitlab = () => {
  const provider: LoginMethod = {
    method: "gitlab",
    name: "GitLab",
  }

  return <ProviderLink provider={provider} />
}

export const gnome = () => {
  const provider: LoginMethod = {
    method: "gnome",
    name: "GNOME",
  }

  return <ProviderLink provider={provider} />
}

export const google = () => {
  const provider: LoginMethod = {
    method: "google",
    name: "Google",
  }

  return <ProviderLink provider={provider} />
}

export const StartsLoginAndKeepsReturnPath: Story = {
  args: {
    provider: { method: "github", name: "GitHub" },
  },
  parameters: {
    nextjs: {
      appDirectory: true,
      router: { replace },
      navigation: {
        pathname: "/login",
        query: { returnTo: "/apps/org.example.App" },
      },
    },
    msw: {
      handlers: [
        http.get("*/auth/login/github", () =>
          HttpResponse.json({
            redirect: "https://github.com/login/oauth/authorize?state=test",
          }),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    window.localStorage.removeItem("returnTo")
    replace.mockClear()

    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole("button", { name: "Log in with GitHub" }),
    )

    await waitFor(() => {
      expect(window.localStorage.getItem("returnTo")).toBe(
        JSON.stringify("/apps/org.example.App"),
      )
      expect(replace).toHaveBeenCalledWith(
        "https://github.com/login/oauth/authorize?state=test",
      )
    })
  },
}
