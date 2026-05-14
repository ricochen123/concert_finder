import {
  AbstractAlgorithm,
  type AlgorithmInput,
  type AlgorithmOutput,
  Cluster,
  MarkerUtils,
  type Marker,
} from "@googlemaps/markerclusterer";
import SuperCluster from "supercluster";
import { clusterRadiusForZoom } from "./clusterRadius";

function markerListSignature(markers: Marker[]): string {
  return markers
    .map((m) => MarkerUtils.getPosition(m).toUrlValue(6))
    .join("|");
}

function clustersSignature(clusters: Cluster[]): string {
  return clusters
    .map((c) => {
      const p = c.position;
      return `${c.count}:${p.lat().toFixed(5)},${p.lng().toFixed(5)}`;
    })
    .join(";");
}

function transformCluster(
  sc: SuperCluster,
  // SuperCluster feature shape varies by version; normalize at runtime.
  feature: {
    type: string;
    geometry: { type: string; coordinates: number[] };
    properties: {
      cluster?: boolean;
      cluster_id?: number;
      marker?: Marker;
    };
  },
): Cluster {
  const props = feature.properties as { cluster?: boolean; cluster_id?: number; marker?: Marker };
  const [lng, lat] = feature.geometry.coordinates as [number, number];
  if (props.cluster && props.cluster_id != null) {
    const markers = sc
      .getLeaves(props.cluster_id, Infinity)
      .map((leaf) => (leaf.properties as { marker: Marker }).marker);
    return new Cluster({ markers, position: { lat, lng } });
  }
  const marker = props.marker!;
  return new Cluster({
    markers: [marker],
    position: MarkerUtils.getPosition(marker),
  });
}

/**
 * Rebuilds SuperCluster with a zoom-dependent radius; at z ≥ 14 returns one
 * cluster per marker (no merging).
 */
export class ZoomAwareClusterAlgorithm extends AbstractAlgorithm {
  private clusters: Cluster[] = [];
  private prevMarkerSig = "";
  private prevZoom = NaN;
  private prevRadius = NaN;
  private prevClusterSig = "";

  constructor() {
    super({ maxZoom: 22 });
  }

  calculate(input: AlgorithmInput): AlgorithmOutput {
    const { markers, map } = input;
    const zoom = Math.round(map.getZoom() ?? 0);
    const markerSig = markerListSignature(markers);
    const markersChanged = markerSig !== this.prevMarkerSig;
    this.prevMarkerSig = markerSig;

    if (zoom >= 14) {
      const next = this.noop({ markers });
      const clusterSig = clustersSignature(next);
      const changed =
        markersChanged || zoom !== this.prevZoom || clusterSig !== this.prevClusterSig;
      this.prevZoom = zoom;
      this.prevClusterSig = clusterSig;
      this.clusters = next;
      return { clusters: this.clusters, changed };
    }

    const radius = clusterRadiusForZoom(zoom);
    const sc = new SuperCluster({
      radius,
      maxZoom: 20,
      minPoints: 2,
      extent: 512,
      minZoom: 0,
    });
    const points = markers.map((marker) => {
      const position = MarkerUtils.getPosition(marker);
      return {
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [position.lng(), position.lat()],
        },
        properties: { marker },
      };
    });
    sc.load(points);
    const next = sc
      .getClusters([-180, -85, 180, 85], zoom)
      .map((f) =>
        transformCluster(
          sc,
          f as {
            type: string;
            geometry: { type: string; coordinates: number[] };
            properties: {
              cluster?: boolean;
              cluster_id?: number;
              marker?: Marker;
            };
          },
        ),
      );

    const clusterSig = clustersSignature(next);
    const changed =
      markersChanged ||
      zoom !== this.prevZoom ||
      radius !== this.prevRadius ||
      clusterSig !== this.prevClusterSig;
    this.prevRadius = radius;
    this.prevZoom = zoom;
    this.prevClusterSig = clusterSig;
    this.clusters = next;
    return { clusters: this.clusters, changed };
  }

  protected cluster(_input: AlgorithmInput): Cluster[] {
    return this.clusters;
  }
}
