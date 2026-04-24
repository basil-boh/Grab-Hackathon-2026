import maplibregl from "maplibre-gl";

export class GrabMapsLib {
  constructor(options) {
    const container = options.container;
    if (!container) {
      throw new Error("GrabMapsLib requires a container");
    }

    this.callbacks = [];
    this.map = new maplibregl.Map({
      container,
      style: options.style,
      center: [Number(options.lng ?? 103.8198), Number(options.lat ?? 1.3521)],
      zoom: Number(options.zoom ?? 12),
      pitch: Number(options.pitch ?? 0),
      bearing: Number(options.bearing ?? 0),
      maxPitch: Number(options.maxPitch ?? 60),
      attributionControl: options.attribution !== false,
      transformRequest: (url, resourceType) => {
        if (typeof options.transformRequest === "function") {
          return options.transformRequest(url, resourceType);
        }

        if (url.startsWith("https://maps.grab.com/api/maps/tiles/v2/styles/")) {
          return { url: `/api/map/proxy?url=${encodeURIComponent(url)}` };
        }

        return { url };
      },
    });

    if (options.navigation !== false) {
      this.map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    }

    this.map.on("error", () => {});
    this.map.on("styleimagemissing", (event) => {
      if (this.map.hasImage(event.id)) return;

      this.map.addImage(event.id, {
        width: 1,
        height: 1,
        data: new Uint8Array([0, 0, 0, 0]),
      });
    });

    this.map.once("load", () => {
      this.ready = true;
      for (const callback of this.callbacks) callback();
      this.callbacks = [];
    });
  }

  getMap() {
    return this.map;
  }

  onReady(callback) {
    if (this.ready || this.map.loaded()) {
      callback();
      return;
    }

    this.callbacks.push(callback);
  }

  destroy() {
    this.map.remove();
  }
}

export default GrabMapsLib;
