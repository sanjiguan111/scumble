import { Behavior, LynxLibraryProvider, LynxLibraryRegistry } from '@lynx/lynx';
import { LynxSkityElement } from './LynxSkityElement';

export class LynxLibraryProviderImpl implements LynxLibraryProvider {
  register(registry: LynxLibraryRegistry): void {
    registry.registerBehavior("x-lynx-skity", new Behavior(LynxSkityElement));
  }
}
