import { useEffect, useRef, type ReactNode } from 'react'
export function Modal({
  children,
  onClose,
  busy,
  labelledBy = 'dialog-title',
}: {
  children: ReactNode
  onClose: () => void
  busy: boolean
  labelledBy?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog?.showModal()
    return () => {
      dialog?.close()
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
    >
      {children}
    </dialog>
  )
}
