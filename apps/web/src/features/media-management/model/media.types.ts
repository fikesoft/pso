import type { Api } from '../../../shared/api';
import type { useMediaEditor } from './use-media-editor';

export type MediaResource = {
  kind: 'employee' | 'product';
  id: string;
  version: number;
  url?: string | null;
};
export interface ResourceImageEditorProps {
  api: Api;
  resource: MediaResource;
  editable: boolean;
  onSaved: () => Promise<void>;
  onLockedChange?: (locked: boolean) => void;
}
export type MediaMutation = { resource: MediaResource; requestKey: string } & (
  | { action: 'SET'; file: File }
  | { action: 'CLEAR' }
);
export type MediaEditorModel = ReturnType<typeof useMediaEditor>;
export type MediaEditorControlsProps = { model: MediaEditorModel; resource: MediaResource };
