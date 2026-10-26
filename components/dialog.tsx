'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { CloseIcon } from './icons';

// A modal on the native <dialog> element: focus trapping, Escape and the backdrop come from the browser.
export function Dialog({
  open,
  onClose,
  title,
  width = 480,
  children,
  footer,
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  width?: number;
  children: ReactNode;
  footer?: ReactNode;
  /** False while something is in flight that must not be abandoned. */
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current && dismissible) onClose();
      }}
      style={{ width }}
      className="m-auto max-w-[calc(100vw-48px)] rounded-modal border border-line bg-surface-1 p-0 text-fg shadow-modal"
    >
      <div className="flex items-center justify-between gap-4 px-6 pt-5">
        <h2 className="text-[20px] leading-7 font-bold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          disabled={!dismissible}
          aria-label="Close"
          className="flex size-9 items-center justify-center rounded-control text-fg-3 hover:bg-surface-3 hover:text-fg disabled:opacity-40"
        >
          <CloseIcon />
        </button>
      </div>
      <div className="px-6 py-4">{children}</div>
      {footer && <div className="flex justify-end gap-3 border-t border-line px-6 py-4">{footer}</div>}
    </dialog>
  );
}
