import { createContext, useContext } from 'react';
const InvalidationContext = createContext<Readonly<Record<string, number>>>({});
export const InvalidationProvider = InvalidationContext.Provider;
export function useInvalidation(key: string) {
  return useContext(InvalidationContext)[key] ?? 0;
}
