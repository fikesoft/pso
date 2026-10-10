import { useEffect, useRef } from 'react';
import { mobileNavigationQuery } from '../config/navigation.constants';
import type { MobileNavigationInput } from './mobile-navigation.types';

export function useMobileNavigation({ open, setOpen }: MobileNavigationInput) {
  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mainAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sidebar = sidebarRef.current;
    const main = mainAreaRef.current;
    const trigger = menuButtonRef.current;
    if (!sidebar || !main) return;
    const media = window.matchMedia(mobileNavigationQuery);
    const updateLayout = () => {
      sidebar.inert = media.matches && !open;
      main.inert = media.matches && open;
      if (!media.matches && open) setOpen(false);
    };
    updateLayout();
    const focusable = () =>
      Array.from(sidebar.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'));
    if (open && media.matches) focusable()[0]?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (!open || !media.matches) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
      }
      if (event.key === 'Tab') {
        const targets = focusable();
        const first = targets[0];
        const last = targets.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    media.addEventListener('change', updateLayout);
    return () => {
      window.removeEventListener('keydown', handleKey);
      media.removeEventListener('change', updateLayout);
      sidebar.inert = false;
      main.inert = false;
      if (open && media.matches) trigger?.focus();
    };
  }, [open, setOpen]);

  return { sidebarRef, menuButtonRef, mainAreaRef };
}
