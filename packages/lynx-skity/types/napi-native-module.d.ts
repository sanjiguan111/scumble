export interface ColorFilter {}


/** @lynxmodule */
export declare class LynxSkityModule {
  setValue(key: string, value: string): void;
  getValue(key: string): string | null;
  setArray(value: Array<number>): void;
  setNumber(value: number): void;
  clear(): void;

  createColorFilter(): Object;
}

