import type { useDemoPos } from './use-demo-pos';
export type DemoPosModel = ReturnType<typeof useDemoPos>;
export interface DemoPosComponentProps {
  model: DemoPosModel;
}
