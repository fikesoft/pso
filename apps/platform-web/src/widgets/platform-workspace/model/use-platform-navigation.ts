import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MOBILE_NAVIGATION_QUERY,
  NAVIGATION_FOCUSABLE_SELECTOR,
} from '../../../shared/config/platform.constants';

export function usePlatformNavigation() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigationRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const closeNavigation = useCallback(() => {
    setMobileOpen(false);
  }, []);
  function openNavigation() {
    triggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setMobileOpen(true);
  }
  useEffect(() => {
    if (!mobileOpen) {
      if (triggerRef.current?.isConnected) triggerRef.current.focus();
      return;
    }
    const navigation = navigationRef.current;
    const focusable = () =>
      Array.from(navigation?.querySelectorAll<HTMLElement>(NAVIGATION_FOCUSABLE_SELECTOR) ?? []);
    focusable()[0]?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeNavigation();
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    const viewport = window.matchMedia(MOBILE_NAVIGATION_QUERY);
    const onViewportChange = () => {
      if (!viewport.matches) closeNavigation();
    };
    document.addEventListener('keydown', onKeyDown);
    viewport.addEventListener('change', onViewportChange);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      viewport.removeEventListener('change', onViewportChange);
    };
  }, [mobileOpen, closeNavigation]);
  return { mobileOpen, navigationRef, closeNavigation, openNavigation };
}
