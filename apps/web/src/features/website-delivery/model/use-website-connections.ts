import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CreateWebsiteConnectionRequest,
  CreateWebsiteKeyRequest,
  WebsiteConnection,
} from '@pos/contracts';
import { errorMessage } from '@pos/ui/api';
import { websiteDeliveryMessages as text } from '@pos/ui/locales';
import { useRemoteData } from '../../../shared/lib';
import {
  createConnection,
  createKey,
  readConnections,
  revokeKey,
  updateConnection,
} from '../api/website.api';
import { isUnknownWebsiteResult } from '../lib/website-presentation';
import type { ConnectionDialog, WebsiteConnectionsProps } from './website-delivery.types';

export function useWebsiteConnections({ api }: WebsiteConnectionsProps) {
  const load = useCallback(() => readConnections(api), [api]);
  const connections = useRemoteData(load);
  const [dialog, setDialog] = useState<ConnectionDialog | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef(false);
  const lifetime = useRef(0);
  useEffect(
    () => () => {
      lifetime.current++;
    },
    [],
  );
  function open(value: ConnectionDialog) {
    setError('');
    setDialog(value);
  }
  async function run(operation: () => Promise<void>, unknownHint?: string) {
    if (pending.current) return;
    pending.current = true;
    const current = lifetime.current;
    setBusy(true);
    setError('');
    try {
      await operation();
      if (current !== lifetime.current) return;
      setDialog(null);
      setNotice(text.saved);
      await connections.refresh();
    } catch (error) {
      if (current !== lifetime.current) return;
      setError(errorMessage(error));
      if (unknownHint && isUnknownWebsiteResult(error)) {
        // Generated plaintext is intentionally unrecoverable; never automatically issue again.
        setNotice(unknownHint);
        setDialog(null);
      }
      await connections.refresh();
    } finally {
      pending.current = false;
      if (current === lifetime.current) setBusy(false);
    }
  }
  async function create(input: CreateWebsiteConnectionRequest) {
    await run(async () => {
      await createConnection(api, input);
    }, text.createUnknown);
  }
  async function issue(id: string, input: CreateWebsiteKeyRequest) {
    const current = lifetime.current;
    await run(async () => {
      const result = await createKey(api, id, input);
      if (current === lifetime.current) setSecret(result.apiKey);
    }, text.issueUnknown);
  }
  async function toggle(connection: WebsiteConnection) {
    await run(async () => {
      await updateConnection(api, connection.id, {
        version: connection.version,
        status: connection.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE',
      });
    });
  }
  async function revoke(id: string) {
    await run(async () => {
      await revokeKey(api, id);
    });
  }
  return {
    connections,
    dialog,
    setDialog,
    secret,
    setSecret,
    busy,
    error,
    notice,
    open,
    create,
    issue,
    toggle,
    revoke,
  };
}
