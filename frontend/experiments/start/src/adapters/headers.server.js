import { getRequest } from "@tanstack/react-start/server"

export async function headers() {
  return getRequest().headers
}
