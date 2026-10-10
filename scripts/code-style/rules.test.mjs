import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { checkDependency, checkPlacement } from './rules.mjs';
import { detectCycles } from './imports.mjs';

const source = (file, code) => ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);

describe('feature boundaries remain enforceable after refactors', () => {
  it('allows composition through a lower slice public API', () => {
    expect(
      checkDependency(
        'apps/web/src/widgets/workspace/ui/workspace.tsx',
        'apps/web/src/features/staff/index.ts',
      ),
    ).toEqual([]);
  });
  it('rejects upward dependencies, sibling coupling and deep cross-slice imports', () => {
    expect(
      checkDependency(
        'apps/web/src/entities/staff/model/user.ts',
        'apps/web/src/features/staff/index.ts',
      ),
    ).not.toEqual([]);
    expect(
      checkDependency(
        'apps/api/src/features/staff/api/router.ts',
        'apps/api/src/features/roles/index.ts',
      ),
    ).not.toEqual([]);
    expect(
      checkDependency(
        'apps/web/src/views/workspace/ui/page.tsx',
        'apps/web/src/features/staff/model/use-staff.ts',
      ),
    ).not.toEqual([]);
  });
  it('allows related files inside one slice and common shared infrastructure', () => {
    expect(
      checkDependency(
        'apps/web/src/features/staff/ui/form.tsx',
        'apps/web/src/features/staff/model/staff.types.ts',
      ),
    ).toEqual([]);
    expect(
      checkDependency(
        'apps/web/src/shared/api/client.ts',
        'apps/web/src/shared/config/api.constants.ts',
      ),
    ).toEqual([]);
  });
  it('does not let a compatibility barrel bypass the layer rule', () => {
    expect(
      checkDependency('apps/api/src/entities/session/model/session.ts', 'apps/api/src/auth.ts'),
    ).not.toEqual([]);
  });
});

describe('types, constants and dependency cycles', () => {
  it('uses the same separate type-import convention across frontend and backend', () => {
    for (const file of [
      'apps/web/src/features/staff/ui/form.tsx',
      'apps/api/src/features/staff/api/router.ts',
    ]) {
      expect(
        checkPlacement(file, source(file, 'import { useState, type FormEvent } from "react";')),
      ).toHaveLength(1);
      expect(
        checkPlacement(
          file,
          source(file, 'import { useState } from "react"; import type { FormEvent } from "react";'),
        ),
      ).toEqual([]);
    }
  });
  it('keeps named props and module data out of the component body file', () => {
    const file = 'apps/web/src/features/staff/ui/form.tsx';
    const issues = checkPlacement(
      file,
      source(
        file,
        'type FormProps = { name: string }; const tabs = ["active", "disabled"] as const;',
      ),
    );
    expect(issues).toHaveLength(2);
  });
  it('accepts owned contracts/config and ordinary local state', () => {
    const types = 'apps/web/src/features/staff/model/form.types.ts';
    const constants = 'apps/web/src/features/staff/config/form.constants.ts';
    const component = 'apps/web/src/features/staff/ui/form.tsx';
    expect(
      checkPlacement(types, source(types, 'export type FormProps = { name: string };')),
    ).toEqual([]);
    expect(
      checkPlacement(
        constants,
        source(constants, 'export const tabs = ["active", "disabled"] as const;'),
      ),
    ).toEqual([]);
    expect(
      checkPlacement(
        component,
        source(component, 'export function Form() { const pending = false; return pending; }'),
      ),
    ).toEqual([]);
  });
  it('finds a cycle through public reexports while allowing a dependency diamond', () => {
    expect(
      detectCycles(
        new Map([
          ['a', ['b']],
          ['b', ['c']],
          ['c', ['a']],
        ]),
      ),
    ).toEqual([['a', 'b', 'c', 'a']]);
    expect(
      detectCycles(
        new Map([
          ['a', ['b', 'c']],
          ['b', ['d']],
          ['c', ['d']],
          ['d', []],
        ]),
      ),
    ).toEqual([]);
  });
});
