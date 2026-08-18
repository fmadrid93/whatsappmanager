export interface IDatabaseProbe {
  ping(): Promise<void>;
}
