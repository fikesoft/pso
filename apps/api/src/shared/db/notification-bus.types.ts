export interface NotificationObserver {
  onMessage: (payload: string) => void;
  onReady: () => void;
  onDisconnect: () => void;
}
export interface NotificationChannel {
  observers: Set<NotificationObserver>;
  ready: boolean;
  stop: () => Promise<void>;
}
