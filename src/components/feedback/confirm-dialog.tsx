import { useId } from 'react'
import type { ReactNode } from 'react'
import { Modal } from '../ui/modal'
import { Button } from '../ui/button'
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  description: ReactNode
  confirmLabel?: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const id = useId()
  return open ? (
    <Modal onClose={onCancel} busy={busy} labelledBy={id}>
      <h2 id={id}>{title}</h2>
      <div className="dialog-description">{description}</div>
      <div className="actions">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm} disabled={busy}>
          {busy ? 'Please wait…' : confirmLabel}
        </Button>
      </div>
    </Modal>
  ) : null
}
