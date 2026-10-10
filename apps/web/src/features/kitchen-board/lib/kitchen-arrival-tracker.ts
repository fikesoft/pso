export function createKitchenArrivalTracker() {
  let previous: bigint | undefined;
  return {
    observe(revision: string) {
      if (!/^\d+$/.test(revision)) throw new Error('Invalid kitchen arrival revision');
      const current = BigInt(revision);
      const arrived = previous !== undefined && current > previous;
      previous = current;
      return arrived;
    },
  };
}
