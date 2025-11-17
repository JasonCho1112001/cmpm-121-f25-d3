import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css"; // supporting style for Leaflet
import "./style.css"; // student-controlled page style

// Fix missing marker images
import "./_leafletWorkaround.ts"; // fixes for missing Leaflet images

// Import our luck function
import luck from "./_luck.ts";

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_RADIUS = 8;
const _CACHE_SPAWN_PROBABILITY = 0.1;

// Create basic UI elements
const controlPanelDiv = document.createElement("div");
controlPanelDiv.id = "controlPanel";
document.body.append(controlPanelDiv);

const mapDiv = document.createElement("div");
mapDiv.id = "map";
document.body.append(mapDiv);

const statusPanelDiv = document.createElement("div");
statusPanelDiv.id = "statusPanel";
document.body.append(statusPanelDiv);

// Our classroom location
const CLASSROOM_LATLNG = leaflet.latLng(
  36.997936938057016,
  -122.05703507501151,
);

// Create the map (element with id "map" is defined in index.html)
const map = leaflet.map(mapDiv, {
  center: CLASSROOM_LATLNG,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

// Populate the map with a background tile layer
leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

// Add a marker to represent the player
const playerMarker = leaflet.marker(CLASSROOM_LATLNG);
playerMarker.bindTooltip("That's you!");
playerMarker.addTo(map);

// Display the player's points
const _playerPoints = 0;
statusPanelDiv.innerHTML = "Points: 0";

// Grid data structure
type Cell = {
  i: number;
  j: number;
  bounds: leaflet.LatLngBounds;
  center: leaflet.LatLng;
  token: number | null;
  rect?: leaflet.Rectangle | undefined; // made optional so cells without tokens don't hold a rectangle
};
const cells = new Map<string, Cell>();

function cellKey(i: number, j: number) {
  return `${i},${j}`;
}

// We treat cell (0,0) as the cell containing the classroom (centered on CLASSROOM_LATLNG).
function boundsFor(i: number, j: number) {
  const half = TILE_DEGREES / 2;
  const sw = leaflet.latLng(
    CLASSROOM_LATLNG.lat + i * TILE_DEGREES - half,
    CLASSROOM_LATLNG.lng + j * TILE_DEGREES - half,
  );
  const ne = leaflet.latLng(
    CLASSROOM_LATLNG.lat + i * TILE_DEGREES + half,
    CLASSROOM_LATLNG.lng + j * TILE_DEGREES + half,
  );
  return leaflet.latLngBounds(sw, ne);
}

function latLngToCell(lat: number, lng: number) {
  const i = Math.round((lat - CLASSROOM_LATLNG.lat) / TILE_DEGREES);
  const j = Math.round((lng - CLASSROOM_LATLNG.lng) / TILE_DEGREES);
  return { i, j };
}

// Determine initial token for a cell deterministically using luck()
// Spawn with probability _CACHE_SPAWN_PROBABILITY; value is 1,2,4,8 (power of two)
function initialTokenFor(i: number, j: number): number | null {
  const spawnSeed = `${i},${j},spawn`;
  if (luck(spawnSeed) >= _CACHE_SPAWN_PROBABILITY) return null;
  const valueSeed = `${i},${j},value`;
  const exponent = Math.floor(luck(valueSeed) * 4); // 0..3
  return 2 ** exponent;
}

// Initialize cells around the classroom
for (let i = -NEIGHBORHOOD_RADIUS; i <= NEIGHBORHOOD_RADIUS; i++) {
  for (let j = -NEIGHBORHOOD_RADIUS; j <= NEIGHBORHOOD_RADIUS; j++) {
    const b = boundsFor(i, j);
    const center = b.getCenter();

    // Decide token deterministically
    const token = initialTokenFor(i, j);

    // Only create a visible rectangle + label if the cell actually has a token.
    let rect: leaflet.Rectangle | undefined = undefined;
    if (token !== null) {
      rect = leaflet
        .rectangle(b, {
          color: "#666",
          weight: 1,
          fill: false,
          interactive: false,
        })
        .addTo(map);

      rect.bindTooltip(String(token), {
        permanent: true,
        direction: "center",
        className: "cell-label",
      });
    }

    const cell: Cell = { i, j, bounds: b, center, token, rect };
    cells.set(cellKey(i, j), cell);
  }
}

// Utility: log an example mapping and counts for quick verification
const example = latLngToCell(CLASSROOM_LATLNG.lat, CLASSROOM_LATLNG.lng);
console.info(
  "Classroom cell:",
  example,
  "Total initialized cells:",
  cells.size,
);
