declare module "grab-maps" {
  export class GrabMapsLib {
    constructor(options: Record<string, unknown>);
    getMap?: () => any;
    getClient?: () => any;
    onReady?: (callback: () => void) => void;
    destroy?: () => void;
    instance?: any;
  }
}
