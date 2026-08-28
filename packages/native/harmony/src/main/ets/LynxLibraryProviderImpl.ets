import { Behavior, LynxLibraryProvider, LynxLibraryRegistry } from '@lynx/lynx';
import { ScumbleElement } from './ScumbleElement';

export class LynxLibraryProviderImpl implements LynxLibraryProvider {
  register(registry: LynxLibraryRegistry): void {
    registry.registerBehavior("x-scumble", new Behavior(ScumbleElement));
  }
}
