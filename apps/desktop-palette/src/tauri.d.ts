/** The part of Tauri's global API (`app.withGlobalTauri`) the palette uses. */
interface Window {
  __TAURI__: {
    core: {
      invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
    };
    event: {
      listen: (event: string, handler: () => void) => Promise<() => void>;
    };
  };
}
