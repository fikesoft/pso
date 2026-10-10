'use client';
import { useState } from 'react';
import { Provider } from 'react-redux';
import { makeStore } from '../../../entities/workspace';
import { DemoPos } from '../../../widgets/demo-pos';
export function PosDemo() {
  const [store] = useState(makeStore);
  return (
    <Provider store={store}>
      <DemoPos />
    </Provider>
  );
}
