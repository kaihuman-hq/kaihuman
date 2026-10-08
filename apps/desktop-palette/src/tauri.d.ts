/** The part of Tauri's global API (`app.withGlobalTauri`) the palette and braindump windows use. */
interface Window {
  __TAURI__: {
    core: {
      invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
    };
    event: {
      listen: <T = unknown>(
        event: string,
        handler: (event: { payload: T }) => void,
      ) => Promise<() => void>;
    };
  };
}
