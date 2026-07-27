import { useTranslations } from "next-intl"
import { calculateHumanReadableSize } from "../../../size"
import { Summary } from "../../../types/Summary"
import Modal from "../../Modal"
import { StackedListBox } from "../StackedListBox"
import SizeBadge from "./SizeBadge"

const DownloadSizeModal = ({
  isOpen,
  onClose,
  summary,
  downloadSize,
}: {
  isOpen: boolean
  onClose: () => void
  summary: Summary
  downloadSize: number
}) => {
  const t = useTranslations()

  const items: {
    id: number
    header: string
    description?: string
    icon?: React.JSX.Element
  }[] = [
    {
      id: 0,
      header: t("download-size"),
      description: t("sub-header.amount-to-download"),
      icon: <SizeBadge size={calculateHumanReadableSize(downloadSize)} />,
    },
  ]

  if (typeof summary.installed_size === "number") {
    items.push({
      id: 1,
      header: t("installed-size"),
      description: t("sub-header.size-on-disk"),
      icon: (
        <SizeBadge size={calculateHumanReadableSize(summary.installed_size)} />
      ),
    })
  }

  if (summary.metadata?.runtimeInstalledSize) {
    items.push({
      id: 2,
      header: t("sub-header.installed-runtime-size"),
      description: summary.metadata.runtimeName
        ? summary.metadata.runtimeName
        : undefined,
      icon: (
        <SizeBadge
          size={calculateHumanReadableSize(
            summary.metadata.runtimeInstalledSize,
          )}
        />
      ),
    })
  }

  return (
    <Modal
      shown={isOpen}
      onClose={onClose}
      centerTitle
      aboveTitle={
        <div className="flex flex-col items-center pb-2">
          <SizeBadge size={calculateHumanReadableSize(downloadSize)} />
        </div>
      }
      title={t("download-size")}
      size="sm"
    >
      <StackedListBox items={items} />
    </Modal>
  )
}

export default DownloadSizeModal
