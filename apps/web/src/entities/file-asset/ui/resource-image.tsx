import { useState } from 'react';
import type { ResourceImageProps } from '../model/file-asset.types';

function BoundImage({ src, alt, fallback, className = 'media-preview' }: ResourceImageProps) {
  const [failed, setFailed] = useState(false);
  if (!src || failed)
    return (
      <span className={className} aria-label={alt}>
        {fallback}
      </span>
    );
  return (
    <img className={className} src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />
  );
}

export function ResourceImage(props: ResourceImageProps) {
  return <BoundImage key={props.src ?? 'empty'} {...props} />;
}
