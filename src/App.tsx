import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Circle,
  GoogleMap,
  InfoWindow,
  Marker,
  useJsApiLoader,
} from "@react-google-maps/api";
import { geocodePlace } from "./api/geocode";
import {
  fetchConcertsNear,
  initialFetchPagesForRadius,
  type ConcertListItem,
} from "./api/ticketmaster";
import { DateRangeFilter, type DateRangeValue } from "./components/DateRangeFilter";
import { LocationAutocomplete } from "./components/LocationAutocomplete";
import { GenreFilterPanel } from "./components/GenreFilterPanel";
import { VenueEventsModal } from "./components/VenueEventsModal";
import {
  deselectAllGenres,
  eventPassesGenreSelection,
  initGenreSelection,
  mergeGenreSelection,
  selectAllGenres,
  type GenreSelectionMap,
} from "./genre/genreSelection";
import { buildGenreTree } from "./genre/genreTree";
import { sortParentKeys, SPECIAL_PARENT } from "./genre/routeParent";
import { markerFillForParent } from "./map/markerColors";
import { buildConcertMapMarker, pinTierForZoom } from "./map/concertPillMarker";
import { DarkClusterRenderer } from "./map/darkClusterRenderer";
import { mapPinCapForZoom } from "./map/mapPinCap";
import {
  markersShareExactPosition,
  nudgeZoomIntoGeographicCluster,
} from "./map/nudgeClusterZoom";
import { ZoomAwareClusterAlgorithm } from "./map/zoomAwareClusterAlgorithm";
import {
  groupDisplayShowsForVenueMap,
  headlineRowForVenueGroup,
  venueGroupEventTotal,
  venueGroupImportance,
} from "./map/venueMapGroups";
import { collapseRecurringShows, type DisplayShow } from "./process/collapseShows";
import "./App.css";

const DEFAULT_CENTER = { lat: 40.7128, lng: -74.006 };

function zoomForRadiusMiles(radius: number): number {
  const r = Math.min(200, Math.max(1, radius));
  const z = 14.5 - Math.log2(r / 2);
  return Math.min(15, Math.max(8, Math.round(z * 10) / 10));
}

const ZOOM_AFTER_LOCATE = 15;

type ViewMode = "map" | "list";

export default function App() {
  const mapsKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "";
  const tmKey = import.meta.env.VITE_TICKETMASTER_API_KEY ?? "";

  const { isLoaded, loadError } = useJsApiLoader({
    id: "concert-finder-map",
    googleMapsApiKey: mapsKey,
  });

  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [radius, setRadius] = useState(25);
  const [mapZoom, setMapZoom] = useState(() => zoomForRadiusMiles(25));
  const [events, setEvents] = useState<ConcertListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [geoWorking, setGeoWorking] = useState(false);
  const [isUserAnchor, setIsUserAnchor] = useState(false);
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null);
  const [locationQuery, setLocationQuery] = useState("");
  const [geoSearchWorking, setGeoSearchWorking] = useState(false);
  const [areaPrompt, setAreaPrompt] = useState("New York City area (default)");

  const [showSpecialEvents, setShowSpecialEvents] = useState(false);
  const [dateRange, setDateRange] = useState<DateRangeValue>({
    start: null,
    end: null,
  });
  const [artistSearch, setArtistSearch] = useState("");
  const areaResetKeyRef = useRef<string | null>(null);
  const [genreSel, setGenreSel] = useState<GenreSelectionMap>({});
  const [filterEpoch, setFilterEpoch] = useState(0);
  const epochRef = useRef(-1);
  const mapRef = useRef<google.maps.Map | null>(null);
  const zoomListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const [venueStackModal, setVenueStackModal] = useState<{
    venueName: string;
    rows: DisplayShow[];
  } | null>(null);

  const closeVenueModal = useCallback(() => {
    setVenueStackModal(null);
  }, []);

  const markerMetaRef = useRef(
    new Map<google.maps.Marker, { rows: DisplayShow[] }>(),
  );
  const rowKeyToMarkerRef = useRef(new Map<string, google.maps.Marker>());

  useEffect(() => {
    if (!tmKey) {
      setEvents([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchConcertsNear({
      apiKey: tmKey,
      lat: center.lat,
      lng: center.lng,
      radiusMiles: radius,
      startPage: 0,
      maxPages: initialFetchPagesForRadius(radius),
      signal: controller.signal,
    })
      .then(({ events: next }) => {
        const areaKey = `${tmKey}|${center.lat.toFixed(5)}|${center.lng.toFixed(5)}`;
        const areaChanged = areaResetKeyRef.current !== areaKey;
        if (areaChanged) areaResetKeyRef.current = areaKey;
        setEvents(next);
        setSelectedKey(null);
        if (areaChanged) setFilterEpoch((e) => e + 1);
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setEvents([]);
        setError(e instanceof Error ? e.message : "Failed to load concerts.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [tmKey, center.lat, center.lng, radius]);

  useEffect(() => {
    setMapZoom(zoomForRadiusMiles(radius));
  }, [radius]);

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported in this browser.");
      return;
    }
    setGeoWorking(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenter({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setMapZoom(ZOOM_AFTER_LOCATE);
        setIsUserAnchor(true);
        const raw = pos.coords.accuracy;
        const m =
          raw != null && Number.isFinite(raw)
            ? Math.min(900, Math.max(55, raw))
            : 160;
        setAccuracyMeters(m);
        setGeoWorking(false);
        setAreaPrompt("Near your location");
      },
      () => {
        setGeoWorking(false);
        setError(
          "Could not read your location. Allow location access and try again.",
        );
      },
      { enableHighAccuracy: true, timeout: 12_000 },
    );
  };

  const searchPlace = async () => {
    setGeoSearchWorking(true);
    setError(null);
    try {
      const hit = await geocodePlace(locationQuery);
      if (!hit) {
        setError("No location found for that search. Try a city name or ZIP.");
        return;
      }
      setCenter({ lat: hit.lat, lng: hit.lng });
      setIsUserAnchor(false);
      setAccuracyMeters(null);
      setLocationQuery(hit.label);
      setAreaPrompt(hit.label);
    } catch {
      setError("Could not look up that location (network error).");
    } finally {
      setGeoSearchWorking(false);
    }
  };

  const specialAvailable = useMemo(
    () => events.some((e) => e.filterParent === SPECIAL_PARENT),
    [events],
  );

  const poolAfterSpecial = useMemo(() => {
    if (!showSpecialEvents) {
      return events.filter((e) => e.filterParent !== SPECIAL_PARENT);
    }
    return events;
  }, [events, showSpecialEvents]);

  const pool = useMemo(() => {
    const { start, end } = dateRange;
    if (!start || !end) return poolAfterSpecial;
    return poolAfterSpecial.filter((e) => {
      const ld = e.localDate;
      if (!ld) return false;
      return ld >= start && ld <= end;
    });
  }, [poolAfterSpecial, dateRange]);

  const tree = useMemo(() => buildGenreTree(pool), [pool]);

  useEffect(() => {
    if (epochRef.current !== filterEpoch) {
      epochRef.current = filterEpoch;
      setGenreSel(initGenreSelection(tree));
      return;
    }
    setGenreSel((prev) => mergeGenreSelection(prev, tree));
  }, [tree, filterEpoch]);

  const filteredEvents = useMemo(() => {
    return pool.filter((e) => eventPassesGenreSelection(e, genreSel));
  }, [pool, genreSel]);

  const artistQuery = artistSearch.trim().toLowerCase();
  const artistFilteredEvents = useMemo(() => {
    if (!artistQuery) return filteredEvents;
    return filteredEvents.filter((e) =>
      e.name.toLowerCase().includes(artistQuery),
    );
  }, [filteredEvents, artistQuery]);

  const displayShows = useMemo(
    () => collapseRecurringShows(artistFilteredEvents),
    [artistFilteredEvents],
  );

  const mapPinCap = mapPinCapForZoom(mapZoom);
  const venueGroupsAll = useMemo(
    () => groupDisplayShowsForVenueMap(displayShows),
    [displayShows],
  );
  const displayVenueGroupsForMap = useMemo(() => {
    if (mapPinCap == null) return venueGroupsAll;
    const ranked = [...venueGroupsAll].sort((a, b) => {
      const sa = venueGroupImportance(a);
      const sb = venueGroupImportance(b);
      if (sb !== sa) return sb - sa;
      return a.rows[0].items[0].sortTimeMs - b.rows[0].items[0].sortTimeMs;
    });
    return ranked.slice(0, mapPinCap);
  }, [venueGroupsAll, mapPinCap]);

  const markerDataSig = useMemo(
    () =>
      `${mapZoom}:${pinTierForZoom(mapZoom)}:${displayVenueGroupsForMap
        .map((g) => {
          const h = headlineRowForVenueGroup(g);
          const ev = h.items[0];
          return `${g.key}|${g.centerLat}|${g.centerLng}|${ev.name}`;
        })
        .join("~")}`,
    [displayVenueGroupsForMap, mapZoom],
  );

  useEffect(() => {
    const map = mapRef.current;
    if (
      !isLoaded ||
      !mapReady ||
      !map ||
      viewMode !== "map" ||
      typeof google === "undefined" ||
      !google.maps
    ) {
      closeVenueModal();
      clustererRef.current?.setMap(null);
      clustererRef.current = null;
      return;
    }

    closeVenueModal();

    const tier = pinTierForZoom(mapZoom);
    const meta = new Map<google.maps.Marker, { rows: DisplayShow[] }>();
    rowKeyToMarkerRef.current.clear();

    const markers: google.maps.Marker[] = [];
    for (const g of displayVenueGroupsForMap) {
      const headline = headlineRowForVenueGroup(g);
      const ev = headline.items[0];
      const multi = headline.items.length > 1;
      const fill = markerFillForParent(ev.filterParent);
      const extraSlots = multi ? headline.items.length - 1 : 0;
      const venueTotal = venueGroupEventTotal(g);
      const venueEventCount =
        g.rows.length > 1 ? venueTotal : undefined;
      const { url, width, height } = buildConcertMapMarker(tier, {
        fillColor: fill,
        localDate: ev.localDate,
        title: ev.name,
        venue: ev.venueName,
        extraSlots: extraSlots > 0 ? extraSlots : undefined,
        venueEventCount,
      });
      const icon: google.maps.Icon = {
        url,
        scaledSize: new google.maps.Size(width, height),
        anchor: new google.maps.Point(width / 2, height),
      };
      const m = new google.maps.Marker({
        position: { lat: g.centerLat, lng: g.centerLng },
        icon,
        zIndex:
          g.rows.some((r) => r.key === selectedKey) ? 6000 : 100,
      });
      m.addListener("click", () => {
        if (g.rows.length > 1) {
          setVenueStackModal({
            venueName: g.venueName,
            rows: [...g.rows].sort(
              (a, b) => a.items[0].sortTimeMs - b.items[0].sortTimeMs,
            ),
          });
        } else {
          setSelectedKey(g.rows[0].key);
        }
      });
      meta.set(m, { rows: g.rows });
      for (const row of g.rows) {
        rowKeyToMarkerRef.current.set(row.key, m);
      }
      markers.push(m);
    }
    markerMetaRef.current = meta;

    if (!clustererRef.current) {
      clustererRef.current = new MarkerClusterer({
        map,
        markers,
        algorithm: new ZoomAwareClusterAlgorithm(),
        renderer: new DarkClusterRenderer(),
        onClusterClick: (_event, cluster, cmap) => {
          if (cluster.count < 2) return;
          const ms = cluster.markers ?? [];
          if (markersShareExactPosition(ms)) {
            const rows: DisplayShow[] = [];
            const seen = new Set<string>();
            for (const marker of ms) {
              const entry = markerMetaRef.current.get(
                marker as google.maps.Marker,
              );
              if (!entry?.rows) continue;
              for (const row of entry.rows) {
                if (!seen.has(row.key)) {
                  seen.add(row.key);
                  rows.push(row);
                }
              }
            }
            if (rows.length === 0) return;
            rows.sort(
              (a, b) => a.items[0].sortTimeMs - b.items[0].sortTimeMs,
            );
            const venueName = rows[0].items[0].venueName;
            setVenueStackModal({ venueName, rows });
          } else {
            nudgeZoomIntoGeographicCluster(cmap, cluster);
          }
        },
      });
    } else {
      clustererRef.current.clearMarkers();
      clustererRef.current.addMarkers(markers);
    }

    return () => {
      closeVenueModal();
      rowKeyToMarkerRef.current.clear();
      clustererRef.current?.setMap(null);
      clustererRef.current = null;
    };
  }, [markerDataSig, isLoaded, mapReady, viewMode, closeVenueModal]);

  useEffect(() => {
    for (const [key, m] of rowKeyToMarkerRef.current) {
      m.setZIndex(key === selectedKey ? 6000 : 100);
    }
  }, [selectedKey]);

  const listRows = useMemo(() => {
    const m = new Map<string, DisplayShow[]>();
    for (const row of displayShows) {
      const p = row.items[0].filterParent;
      const arr = m.get(p) ?? [];
      arr.push(row);
      m.set(p, arr);
    }
    for (const arr of m.values()) {
      arr.sort(
        (a, b) => a.items[0].sortTimeMs - b.items[0].sortTimeMs,
      );
    }
    return sortParentKeys([...m.keys()])
      .map((title) => ({ title, rows: m.get(title)! }))
      .filter((r) => r.rows.length > 0);
  }, [displayShows]);

  useEffect(() => {
    if (
      selectedKey &&
      !displayShows.some((d) => d.key === selectedKey)
    ) {
      setSelectedKey(null);
    }
  }, [displayShows, selectedKey]);

  const selected = useMemo(
    () => displayShows.find((d) => d.key === selectedKey) ?? null,
    [displayShows, selectedKey],
  );

  const mapContainerStyle = useMemo(
    () => ({
      width: "100%",
      height: "100%",
    }),
    [],
  );

  const mapOptions = useMemo<google.maps.MapOptions>(
    () => ({
      fullscreenControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      gestureHandling: "greedy",
      styles: [
        { elementType: "geometry", stylers: [{ color: "#1d2330" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#1a1d26" }] },
        {
          elementType: "labels.text.fill",
          stylers: [{ color: "#9aa3b5" }],
        },
        {
          featureType: "road",
          elementType: "geometry",
          stylers: [{ color: "#2b3140" }],
        },
        {
          featureType: "road",
          elementType: "labels.text.fill",
          stylers: [{ color: "#c4c9d4" }],
        },
        {
          featureType: "water",
          elementType: "geometry",
          stylers: [{ color: "#0e1118" }],
        },
        {
          featureType: "poi",
          elementType: "all",
          stylers: [{ visibility: "off" }],
        },
        {
          featureType: "transit",
          elementType: "all",
          stylers: [{ visibility: "off" }],
        },
      ],
    }),
    [],
  );

  const renderNetflixTile = (row: DisplayShow) => {
    const ev = row.items[0];
    const multi = row.items.length > 1;
    return (
      <a
        key={row.key}
        className="netflix-tile"
        href={ev.url}
        target="_blank"
        rel="noreferrer"
      >
        <div className="netflix-tile-media">
          {ev.imageUrl ? (
            <img
              className="netflix-tile-img"
              src={ev.imageUrl}
              alt=""
              loading="lazy"
            />
          ) : (
            <div className="netflix-tile-img netflix-tile-img--ph" aria-hidden />
          )}
          <div className="netflix-tile-gradient" />
          <div className="netflix-tile-copy">
            <p className="netflix-tile-title">{ev.name}</p>
            <p className="netflix-tile-sub">{ev.genreLine}</p>
            {multi ? (
              <p className="netflix-tile-meta netflix-tile-meta--wrap">
                <strong>{row.items.length} showtimes</strong>
                <br />
                {row.items.slice(0, 8).map((i) => (
                  <Fragment key={i.id}>
                    {i.dateLabel}
                    <br />
                  </Fragment>
                ))}
                {row.items.length > 8 ? (
                  <span className="netflix-tile-more">
                    +{row.items.length - 8} more
                  </span>
                ) : null}
              </p>
            ) : (
              <p className="netflix-tile-meta">{ev.dateLabel}</p>
            )}
            <p className="netflix-tile-venue">{ev.venueName}</p>
          </div>
        </div>
      </a>
    );
  };

  const renderEventCard = (row: DisplayShow) => {
    const ev = row.items[0];
    const multi = row.items.length > 1;
    const pinColor = markerFillForParent(ev.filterParent);
    return (
      <button
        type="button"
        className={`event-card${selectedKey === row.key ? " selected" : ""}`}
        onClick={() => setSelectedKey(row.key)}
      >
        <div className="event-card-thumb-wrap">
          {ev.imageUrl ? (
            <img
              className="event-thumb"
              src={ev.imageUrl}
              alt=""
              loading="lazy"
            />
          ) : (
            <div className="event-thumb event-thumb--placeholder" aria-hidden />
          )}
        </div>
        <div className="event-card-stack">
          <p className="event-title">{ev.name}</p>
          <span
            className="event-genre-pill"
            style={{ backgroundColor: pinColor }}
          >
            {ev.filterParent}
          </span>
          <p className="event-date">
            {multi ? (
              <>
                <span className="event-date-lead">
                  {row.items.length} showtimes
                </span>
                <br />
                {row.items.slice(0, 6).map((i) => (
                  <Fragment key={i.id}>
                    {i.dateLabel}
                    <br />
                  </Fragment>
                ))}
                {row.items.length > 6 ? (
                  <>+{row.items.length - 6} more</>
                ) : null}
              </>
            ) : (
              ev.dateLabel
            )}
          </p>
          <p className="event-venue">{ev.venueName}</p>
        </div>
      </button>
    );
  };

  const mapBlock = () => {
    if (!mapsKey) {
      return (
        <div className="map-fallback">
          <p>
            <strong>Google Maps API key missing.</strong>
            <br />
            Add <code>VITE_GOOGLE_MAPS_API_KEY</code> to your{" "}
            <code>.env</code> and restart <code>npm run dev</code>.
          </p>
        </div>
      );
    }
    if (loadError) {
      return (
        <div className="map-fallback">
          <p>
            <strong>Could not load Google Maps.</strong>
            <br />
            {String(loadError)}
          </p>
        </div>
      );
    }
    if (!isLoaded) {
      return (
        <div className="map-fallback">
          <p>Loading map…</p>
        </div>
      );
    }

    return (
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={center}
        zoom={mapZoom}
        options={mapOptions}
        onLoad={(map) => {
          mapRef.current = map;
          setMapReady(true);
          if (zoomListenerRef.current) {
            zoomListenerRef.current.remove();
            zoomListenerRef.current = null;
          }
          zoomListenerRef.current = map.addListener("zoom_changed", () => {
            closeVenueModal();
            const nz = map.getZoom();
            if (nz != null) setMapZoom(nz);
          });
          const z = map.getZoom();
          if (z != null) setMapZoom(z);
        }}
        onUnmount={() => {
          setMapReady(false);
          if (zoomListenerRef.current) {
            zoomListenerRef.current.remove();
            zoomListenerRef.current = null;
          }
          mapRef.current = null;
        }}
        onClick={() => {
          closeVenueModal();
          setSelectedKey(null);
        }}
      >
        {isUserAnchor && accuracyMeters != null ? (
          <>
            <Circle
              center={center}
              radius={accuracyMeters}
              options={{
                strokeColor: "#5eead4",
                strokeOpacity: 0.55,
                strokeWeight: 1,
                fillColor: "#2dd4bf",
                fillOpacity: 0.08,
                zIndex: 1,
              }}
            />
            <Circle
              center={center}
              radius={38}
              options={{
                strokeColor: "#ccfbf1",
                strokeOpacity: 0.9,
                strokeWeight: 2,
                fillColor: "#99f6e4",
                fillOpacity: 0.2,
                zIndex: 2,
              }}
            />
          </>
        ) : null}
        <Marker
          position={center}
          zIndex={isUserAnchor ? 10_000 : 100}
          title={isUserAnchor ? "Your location" : "Search center"}
          icon={
            isUserAnchor
              ? {
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 11,
                  fillColor: "#f0fdfa",
                  fillOpacity: 1,
                  strokeColor: "#14b8a6",
                  strokeWeight: 3,
                }
              : {
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 8,
                  fillColor: "#6ee7b7",
                  fillOpacity: 0.95,
                  strokeColor: "#0c0d10",
                  strokeWeight: 2,
                }
          }
        />
        {viewMode === "map" && selected ? (
          <InfoWindow
            position={{
              lat: selected.items[0].lat,
              lng: selected.items[0].lng,
            }}
            options={{
              headerDisabled: true,
              maxWidth: 280,
            }}
            onCloseClick={() => setSelectedKey(null)}
          >
            <div className="info-window">
              <button
                type="button"
                className="info-window-dismiss"
                onClick={() => setSelectedKey(null)}
                aria-label="Close"
              >
                ×
              </button>
              {selected.items[0].imageUrl ? (
                <img
                  src={selected.items[0].imageUrl}
                  alt=""
                  className="info-window-thumb"
                />
              ) : (
                <div
                  className="info-window-thumb info-window-thumb--placeholder"
                  aria-hidden
                />
              )}
              <h3>{selected.items[0].name}</h3>
              <p className="info-genre">{selected.items[0].genreLine}</p>
              {selected.items.length > 1 ? (
                <ul className="info-slots">
                  {selected.items.map((i) => (
                    <li key={i.id}>
                      <a href={i.url} target="_blank" rel="noreferrer">
                        {i.dateLabel}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <>
                  <p>{selected.items[0].dateLabel}</p>
                  <p>{selected.items[0].venueName}</p>
                  <a
                    href={selected.items[0].url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Tickets & details →
                  </a>
                </>
              )}
              {selected.items.length > 1 ? (
                <p className="info-venue">{selected.items[0].venueName}</p>
              ) : null}
            </div>
          </InfoWindow>
        ) : null}
      </GoogleMap>
    );
  };

  const filterPanelProps = {
    tree,
    selection: genreSel,
    onSelectionChange: setGenreSel,
    showSpecialEvents,
    onShowSpecialEventsChange: setShowSpecialEvents,
    specialAvailable,
    onDeselectAll: () =>
      setGenreSel((prev) => deselectAllGenres(tree, prev)),
    onSelectAll: () => setGenreSel((prev) => selectAllGenres(tree, prev)),
  };

  return (
    <div className="app-shell">
      <header className="app-header app-header--toolbar">
        <h1 className="app-title">Concert Finder</h1>
        <label className="list-toolbar-artist header-toolbar-artist">
          <span className="sr-only">Artist</span>
          <input
            type="search"
            className="list-toolbar-artist-input"
            placeholder="Search by name…"
            aria-label="Search by artist name"
            value={artistSearch}
            onChange={(e) => setArtistSearch(e.target.value)}
            enterKeyHint="search"
          />
        </label>
        <div
          className="header-toolbar-date-genre"
          role="group"
          aria-label="Date range and genres"
        >
          <DateRangeFilter
            className="date-filter--in-toolbar"
            value={dateRange}
            onApply={({ start, end }) => setDateRange({ start, end })}
            onClear={() => setDateRange({ start: null, end: null })}
          />
          <GenreFilterPanel
            {...filterPanelProps}
            className="genre-panel-wrap--toolbar header-toolbar-genre"
          />
        </div>
        <div className="view-toggle" role="group" aria-label="View mode">
          <button
            type="button"
            className={`btn btn-toggle${viewMode === "map" ? " active" : ""}`}
            onClick={() => setViewMode("map")}
          >
            Map
          </button>
          <button
            type="button"
            className={`btn btn-toggle${viewMode === "list" ? " active" : ""}`}
            onClick={() => setViewMode("list")}
          >
            List
          </button>
        </div>
        <div className="header-toolbar-location">
          <LocationAutocomplete
            value={locationQuery}
            onChange={setLocationQuery}
            disabled={geoSearchWorking}
            placeholder="City, state, or ZIP"
            onEnterSearch={() => void searchPlace()}
            onPick={(hit) => {
              setCenter({ lat: hit.lat, lng: hit.lng });
              setIsUserAnchor(false);
              setAccuracyMeters(null);
              setAreaPrompt(hit.label);
            }}
          />
        </div>
        <button
          type="button"
          className="btn btn-primary header-toolbar-loc-search"
          onClick={() => void searchPlace()}
          disabled={geoSearchWorking || !locationQuery.trim()}
        >
          {geoSearchWorking ? "Searching…" : "Search"}
        </button>
        <button
          type="button"
          className="btn btn-primary header-toolbar-locate"
          onClick={useMyLocation}
          disabled={geoWorking}
        >
          {geoWorking ? "Locating…" : "Use my location"}
        </button>
        <label className="field header-toolbar-radius">
          Radius
          <input
            type="range"
            min={5}
            max={100}
            step={5}
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
          />
          <span>{radius} mi</span>
        </label>
      </header>

      <div className="app-banners">
        {error ? (
          <div className="banner error" role="alert">
            {error}
          </div>
        ) : null}
        {!tmKey ? (
          <div className="banner hint">
            Create a{" "}
            <a
              href="https://developer.ticketmaster.com/products-and-docs/apis/getting-started/"
              target="_blank"
              rel="noreferrer"
            >
              Ticketmaster Developer
            </a>{" "}
            API key and a{" "}
            <a
              href="https://console.cloud.google.com/google/maps-apis"
              target="_blank"
              rel="noreferrer"
            >
              Google Maps JavaScript API
            </a>{" "}
            key, then copy <code>env.example</code> to <code>.env</code>.
          </div>
        ) : null}
      </div>

      {viewMode === "list" ? (
        <div className="list-page">
          <div className="list-main">
            <div className="list-body">
              <p
                className="list-context-line list-context-banner"
                title={`${areaPrompt} · ${radius} mi`}
              >
                <span className="list-context-muted">Showing concerts near </span>
                <span className="list-context-place">{areaPrompt}</span>
                <span className="list-context-muted">
                  {" "}
                  · Within {radius} mi · {artistFilteredEvents.length} show
                  {artistFilteredEvents.length === 1 ? "" : "s"} · soonest first
                </span>
              </p>
              {loading && events.length === 0 ? (
                <div className="loader list-loader">Fetching concerts…</div>
              ) : null}
                {!loading && events.length === 0 && tmKey ? (
                  <div className="empty list-empty">
                    No upcoming music events with coordinates in this radius. Try
                    a larger radius or another city/ZIP.
                  </div>
                ) : null}
                {!loading &&
                events.length > 0 &&
                artistFilteredEvents.length === 0 ? (
                  <div className="empty list-empty">
                    {filteredEvents.length === 0
                      ? "No shows match the current filters."
                      : `No shows match artist search “${artistSearch.trim()}”.`}
                  </div>
                ) : null}

              {listRows.map((row) => (
                <section className="genre-shelf" key={row.title}>
                  <h3 className="genre-shelf-title">{row.title}</h3>
                  <div className="genre-shelf-rail">
                    {row.rows.map((r) => renderNetflixTile(r))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="layout">
          <aside className="sidebar">
            <div className="sidebar-main">
              <div className="sidebar-head">
                {loading
                  ? "Loading events…"
                  : `${artistFilteredEvents.length} show${artistFilteredEvents.length === 1 ? "" : "s"} · ${displayShows.length} listing${displayShows.length === 1 ? "" : "s"} · map ${displayVenueGroupsForMap.length} venue pin${displayVenueGroupsForMap.length === 1 ? "" : "s"}${
                      mapPinCap != null &&
                      displayVenueGroupsForMap.length < venueGroupsAll.length
                        ? ` (${venueGroupsAll.length} total, importance)`
                        : ""
                    } · soonest first`}
              </div>
              <div className="event-list">
                {loading && events.length === 0 ? (
                  <div className="loader">Fetching nearby concerts…</div>
                ) : null}
                {!loading && events.length === 0 && tmKey ? (
                  <div className="empty">
                    No upcoming music events with coordinates in this radius. Try
                    a larger radius or a major metro area.
                  </div>
                ) : null}
                {!loading &&
                events.length > 0 &&
                artistFilteredEvents.length === 0 ? (
                  <div className="empty">
                    {filteredEvents.length === 0
                      ? "No shows match the current filters."
                      : `No shows match artist search “${artistSearch.trim()}”.`}
                  </div>
                ) : null}
                {displayShows.map((row) => (
                  <Fragment key={row.key}>{renderEventCard(row)}</Fragment>
                ))}
              </div>
            </div>
          </aside>
          <div className="map-wrap">{mapBlock()}</div>
        </div>
      )}
      <VenueEventsModal
        open={venueStackModal != null}
        venueName={venueStackModal?.venueName ?? ""}
        rows={venueStackModal?.rows ?? []}
        onClose={closeVenueModal}
        onSelectRow={(key) => {
          setSelectedKey(key);
          closeVenueModal();
        }}
      />
    </div>
  );
}
