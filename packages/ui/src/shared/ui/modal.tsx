'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { useRef } from 'react';
import { X } from 'lucide-react';
import { roMessages } from '../i18n';
import type { ModalProps } from '../model/primitives.types';

export function Modal({ open, onOpenChange, title, description, children }: ModalProps) {
  const returnFocus = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content"
          onOpenAutoFocus={() => {
            returnFocus.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(event) => {
            const target = returnFocus.current;
            if (target?.isConnected) {
              event.preventDefault();
              target.focus();
            }
          }}
        >
          <header>
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description className={description ? '' : 'sr-only'}>
                {description || title}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="icon-button" aria-label={roMessages.message432}>
                <X size={20} />
              </button>
            </Dialog.Close>
          </header>
          <div className="dialog-body">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
