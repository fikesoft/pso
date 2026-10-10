import { KITCHEN_SOUND } from '../config/sound.constants';

export function createKitchenSound() {
  const context = new AudioContext();
  return {
    async enable() {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          context.resume(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error('Audio activation timed out')),
              KITCHEN_SOUND.activationTimeoutMs,
            );
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
      if (context.state !== 'running') throw new Error('Audio context unavailable');
    },
    play() {
      if (context.state !== 'running') throw new Error('Audio context suspended');
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime;
      oscillator.frequency.value = KITCHEN_SOUND.frequencyHz;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(KITCHEN_SOUND.volume, start + KITCHEN_SOUND.attackSeconds);
      gain.gain.linearRampToValueAtTime(0, start + KITCHEN_SOUND.durationSeconds);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
      oscillator.start(start);
      oscillator.stop(start + KITCHEN_SOUND.durationSeconds);
    },
    async close() {
      if (context.state !== 'closed') await context.close();
    },
  };
}
