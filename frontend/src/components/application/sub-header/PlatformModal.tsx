import { useTranslations } from "next-intl"
import clsx from "clsx"
import {
  Cpu,
  Gamepad2,
  Hand,
  Keyboard,
  Monitor,
  Mouse,
  Smartphone,
  TriangleAlertIcon,
} from "lucide-react"
import Modal from "../../Modal"
import { StackedListBox } from "../StackedListBox"
import { DesktopAppstream } from "src/codegen"

type AppstreamCondition = NonNullable<DesktopAppstream["requires"]>[number]

const compareSymbols: Record<string, string> = {
  eq: "=",
  ne: "≠",
  ge: "≥",
  gt: ">",
  le: "≤",
  lt: "<",
}

const controlInfo: Record<string, { label: string; Icon: typeof Keyboard }> = {
  keyboard: { label: "keyboard", Icon: Keyboard },
  pointing: { label: "mouse", Icon: Mouse },
  touch: { label: "touchscreen", Icon: Hand },
  gamepad: { label: "gamepad", Icon: Gamepad2 },
}

const conditionLabels: Record<string, string> = {
  display_length: "display-size",
  memory: "memory",
}

const getConditionItems = (
  conditions: AppstreamCondition[] | null | undefined,
  relation: "required" | "recommended" | "supported",
  t: ReturnType<typeof useTranslations>,
) =>
  (conditions ?? []).map((condition, index) => {
    const value = condition.value ?? ""
    const control =
      condition.type === "control" ? controlInfo[value] : undefined
    const Icon = control?.Icon ?? (condition.type === "memory" ? Cpu : Monitor)
    const typeLabel = control
      ? control.label
      : (conditionLabels[condition.type] ?? condition.type.replaceAll("_", " "))
    const compare = compareSymbols[condition.compare ?? ""]
    const details = [compare, value].filter(Boolean).join(" ")

    return {
      id: index,
      header: control
        ? t(`sub-header.${typeLabel}-support`)
        : condition.type === "control"
          ? `${value.replaceAll("-", " ")} support`
          : t("sub-header.appstream-requirement", {
              requirement: typeLabel,
            }),
      description: t("sub-header.device-condition", {
        device: control
          ? t(`sub-header.${typeLabel}`)
          : `${typeLabel}: ${details}`,
        relation: t(`sub-header.${relation}`),
      }),
      icon: (
        <div
          className={clsx(
            "h-10 w-10 rounded-full p-2",
            relation === "supported"
              ? "text-flathub-status-green bg-flathub-status-green/25 dark:bg-flathub-status-green-dark/25 dark:text-flathub-status-green-dark"
              : "text-flathub-status-yellow bg-flathub-status-yellow/25 dark:bg-flathub-status-yellow-dark/25 dark:text-flathub-status-yellow-dark",
          )}
        >
          <Icon className="h-full w-full" />
        </div>
      ),
    }
  })

const PlatformModal = ({
  isOpen,
  onClose,
  appName,
  isMobileFriendly,
  requires,
  recommends,
  supports,
}: {
  isOpen: boolean
  onClose: () => void
  appName: string
  isMobileFriendly: boolean
  requires?: DesktopAppstream["requires"]
  recommends?: DesktopAppstream["recommends"]
  supports?: DesktopAppstream["supports"]
}) => {
  const t = useTranslations()
  const deviceInfoItems = [
    ...getConditionItems(requires, "required", t),
    ...getConditionItems(recommends, "recommended", t),
    ...getConditionItems(supports, "supported", t),
  ]

  return (
    <Modal
      shown={isOpen}
      onClose={onClose}
      centerTitle
      aboveTitle={
        <div className="flex flex-col items-center pb-2">
          <div
            className={clsx(
              "h-16 w-16 rounded-full p-3",
              isMobileFriendly
                ? "text-flathub-status-green bg-flathub-status-green/25 dark:bg-flathub-status-green-dark/25 dark:text-flathub-status-green-dark"
                : "text-flathub-status-yellow bg-flathub-status-yellow/25 dark:bg-flathub-status-yellow-dark/25 dark:text-flathub-status-yellow-dark",
            )}
          >
            {isMobileFriendly ? (
              <Smartphone className="w-full h-full" />
            ) : (
              <TriangleAlertIcon className="w-full h-full" />
            )}
          </div>
        </div>
      }
      title={
        isMobileFriendly
          ? t("sub-header.appname-works-on-all-devices", { appName })
          : t("sub-header.appname-works-best-on-specific-hardware", { appName })
      }
      size="sm"
    >
      <StackedListBox
        items={[
          {
            id: 0,
            header: t("sub-header.mobile-support"),
            description: isMobileFriendly
              ? t("sub-header.works-well-on-mobile")
              : t("sub-header.may-not-work-well-on-mobile"),
            icon: (
              <div
                className={clsx(
                  "h-10 w-10 rounded-full p-2",
                  isMobileFriendly
                    ? "text-flathub-status-green bg-flathub-status-green/25 dark:bg-flathub-status-green-dark/25 dark:text-flathub-status-green-dark"
                    : "text-flathub-sonic-silver bg-flathub-gainsborow/40 dark:bg-flathub-dark-gunmetal dark:text-flathub-spanish-gray",
                )}
              >
                <Smartphone className="w-full h-full" />
              </div>
            ),
          },
          {
            id: 1,
            header: t("sub-header.desktop-support"),
            description: t("sub-header.works-well-on-large-screens"),
            icon: (
              <div className="h-10 w-10 rounded-full p-2 text-flathub-status-green bg-flathub-status-green/25 dark:bg-flathub-status-green-dark/25 dark:text-flathub-status-green-dark">
                <Monitor className="w-full h-full" />
              </div>
            ),
          },
          ...deviceInfoItems.map((item, index) => ({
            ...item,
            id: index + 2,
          })),
        ]}
      />
    </Modal>
  )
}

export default PlatformModal
