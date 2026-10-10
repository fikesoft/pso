import { useState } from 'react';
import type { ModifierChoices } from '../../../entities/modifier';

export function useModifierChoices() {
  const [choices, setChoices] = useState<ModifierChoices>({});
  function toggleOption(bindingId: string, optionId: string) {
    setChoices((current) => {
      const selected = current[bindingId] ?? [];
      return {
        ...current,
        [bindingId]: selected.includes(optionId)
          ? selected.filter((id) => id !== optionId)
          : [...selected, optionId],
      };
    });
  }
  return { choices, setChoices, toggleOption };
}
