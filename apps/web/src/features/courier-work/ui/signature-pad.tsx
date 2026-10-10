import { useRef } from 'react';
import type { PointerEvent } from 'react';
import {
  DELIVERY_SIGNATURE_POINT_LIMIT,
  DELIVERY_SIGNATURE_STROKE_LIMIT,
  DELIVERY_SIGNATURE_STROKE_POINTS,
} from '@pos/contracts/delivery';
import { Button } from '@pos/ui';
import { courierWorkMessages as text } from '@pos/ui/locales';
import type { SignaturePadProps } from '../model/courier-transition.types';
export function SignaturePad({ value, onChange, disabled }: SignaturePadProps) {
  const pointer = useRef<number | null>(null);
  const point = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x:
        Math.round(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * 1000) /
        1000,
      y:
        Math.round(Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) * 1000) /
        1000,
    };
  };
  const size = value.reduce((sum, stroke) => sum + stroke.length, 0);
  return (
    <div className="form-stack">
      <strong>{text.signature}</strong>
      <p>{text.proofSignatureHint}</p>
      <svg
        role="img"
        aria-label={text.signature}
        viewBox="0 0 400 160"
        style={{
          width: '100%',
          border: '1px solid currentColor',
          touchAction: 'none',
          background: 'white',
          color: 'black',
        }}
        onPointerDown={(event) => {
          if (
            disabled ||
            pointer.current !== null ||
            size >= DELIVERY_SIGNATURE_POINT_LIMIT ||
            value.length >= DELIVERY_SIGNATURE_STROKE_LIMIT
          )
            return;
          pointer.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          onChange([...value, [point(event)]]);
        }}
        onPointerMove={(event) => {
          if (
            disabled ||
            pointer.current !== event.pointerId ||
            !value.length ||
            size >= DELIVERY_SIGNATURE_POINT_LIMIT
          )
            return;
          const last = value.at(-1)!;
          if (last.length >= DELIVERY_SIGNATURE_STROKE_POINTS) return;
          onChange([...value.slice(0, -1), [...last, point(event)]]);
        }}
        onPointerUp={() => {
          pointer.current = null;
        }}
        onPointerCancel={() => {
          pointer.current = null;
        }}
        onLostPointerCapture={() => {
          pointer.current = null;
        }}
      >
        {value.map((stroke, index) => (
          <polyline
            key={index}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            points={stroke.map((p) => `${p.x * 400},${p.y * 160}`).join(' ')}
          />
        ))}
      </svg>
      <Button
        type="button"
        variant="secondary"
        disabled={disabled || !value.length}
        onClick={() => {
          pointer.current = null;
          onChange([]);
        }}
      >
        {text.clearSignature}
      </Button>
    </div>
  );
}
