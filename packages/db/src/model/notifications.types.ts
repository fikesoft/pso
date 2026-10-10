export interface DatabaseNotificationOptions {
  connectionString: string;
  channel: string;
  onMessage: (payload: string) => void;
  onReady: () => void;
  onDisconnect: () => void;
}
