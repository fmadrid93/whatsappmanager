export interface ICoordinationBus {
  publish(channel: string, payload: string): Promise<void>;
  close(): Promise<void>;
}
