import { mediaMessages as text } from '@pos/ui/locales';
import { ResourceImage } from '../../../entities/file-asset';
import type { ResourceImageEditorProps } from '../model/media.types';
import { useMediaEditor } from '../model/use-media-editor';
import { MediaEditorControls } from './media-editor-controls';

export function ResourceImageEditor(props: ResourceImageEditorProps) {
  const model = useMediaEditor(props);
  const title = props.resource.kind === 'employee' ? text.employeeTitle : text.productTitle;
  return (
    <section className="media-editor form-stack" aria-label={title}>
      <h3>{title}</h3>
      <ResourceImage src={props.resource.url} alt={title} fallback={text.noImage} />
      {props.editable && <MediaEditorControls model={model} resource={props.resource} />}
    </section>
  );
}
