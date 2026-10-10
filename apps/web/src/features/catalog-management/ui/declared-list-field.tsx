import { useId, useState } from 'react';
import { productInformationMessages as text } from '@pos/ui/locales';
import type { DeclaredListFieldProps } from '../model/catalog-management.types';

export function DeclaredListField({ name, value, maximum }: DeclaredListFieldProps) {
  const id = useId();
  const [declared, setDeclared] = useState(value !== null && value !== undefined);
  return (
    <div className="form-stack">
      <label className="check-option">
        <input
          type="checkbox"
          name={`${name}Declared`}
          checked={declared}
          onChange={(event) => setDeclared(event.target.checked)}
        />
        {text[`${name}Declared`]}
      </label>
      <div className="field">
        <label htmlFor={id}>{text[`${name}Input`]}</label>
        <textarea
          id={id}
          name={name}
          disabled={!declared}
          defaultValue={value?.join('\n') ?? ''}
          maxLength={maximum * 101}
          aria-describedby={`${id}-hint`}
        />
        <small id={`${id}-hint`}>{text.listHint}</small>
      </div>
    </div>
  );
}
