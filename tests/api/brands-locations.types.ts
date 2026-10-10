export type AwaitedReturn<T extends (...args: never[]) => Promise<unknown>> = Awaited<
  ReturnType<T>
>;
