import type { KaihumanSharedModule } from '../../modules/kaihuman-shared/index.js';
import { InMemorySharedContainer, type SharedContainer } from '../adapters/widget-bridge.js';

/** `SharedContainer` over the native module; memory when the module is not linked. */
export function createNativeContainer(native: KaihumanSharedModule | null): SharedContainer {
  if (!native) return new InMemorySharedContainer();
  return {
    read: async (name) => native.readSharedFile(name),
    write: async (name, content) => native.writeSharedFile(name, content),
    reloadAllTimelines: async () => native.reloadWidgets(),
  };
}
