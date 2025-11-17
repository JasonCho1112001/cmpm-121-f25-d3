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

// Bottom-left held-token display
const heldTokenDiv = document.createElement("div");
heldTokenDiv.id = "heldToken";
heldTokenDiv.style.position = "fixed";
heldTokenDiv.style.left = "12px";
heldTokenDiv.style.bottom = "12px";
heldTokenDiv.style.padding = "8px 12px";
heldTokenDiv.style.background = "rgba(255,255,255,0.95)";
heldTokenDiv.style.border = "1px solid #333";
heldTokenDiv.style.borderRadius = "6px";
heldTokenDiv.style.boxShadow = "0 2px 6px rgba(0,0,0,0.15)";
heldTokenDiv.style.zIndex = "1000";
heldTokenDiv.style.fontWeight = "600";
heldTokenDiv.textContent = "Held Token: none";
document.body.append(heldTokenDiv);

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

// Player inventory: at most one token
let heldToken: number | null = null;
function refreshHeldDisplay() {
  heldTokenDiv.textContent = heldToken === null
    ? "Held Token: none"
    : `Held Token: ${heldToken}`;
}
refreshHeldDisplay();

// Grid data structure — make rect optional so cells without tokens don't hold an interactive rectangle
type Cell = {
  i: number;
  j: number;
  bounds: leaflet.LatLngBounds;
  center: leaflet.LatLng;
  token: number | null;
  rect?: leaflet.Rectangle | undefined;
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

// Create a single reusable popup/menu element (hidden until needed)
const cellMenu = document.createElement("div");
cellMenu.id = "cellMenu";
cellMenu.style.position = "absolute";
cellMenu.style.display = "none";
cellMenu.style.padding = "6px";
cellMenu.style.background = "white";
cellMenu.style.border = "1px solid #333";
cellMenu.style.borderRadius = "6px";
cellMenu.style.boxShadow = "0 2px 6px rgba(0,0,0,0.25)";
cellMenu.style.zIndex = "1000";
document.body.append(cellMenu);

// Close menu when clicking outside
document.addEventListener("click", (ev) => {
  const target = ev.target as Node;
  if (!cellMenu.contains(target)) hideCellMenu();
});

// Helper to show menu for a cell (positions near the cell center on the map)
function showCellMenuFor(cell: Cell) {
  // Clear previous contents
  cellMenu.innerHTML = "";

  // Add a simple title
  const title = document.createElement("div");
  title.textContent = `Cell ${cell.i},${cell.j}`;
  title.style.fontWeight = "600";
  title.style.marginBottom = "6px";
  cellMenu.appendChild(title);

  // Add the "grab token" button only if cell has token and player holds none
  if (cell.token !== null && heldToken === null) {
    const grabBtn = document.createElement("button");
    grabBtn.textContent = "Grab token";
    grabBtn.style.display = "block";
    grabBtn.style.width = "100%";
    grabBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      // Transfer token to player and remove it from the cell
      heldToken = cell.token;
      cell.token = null;
      // Remove tooltip from the rectangle if present
      cell.rect?.unbindTooltip();
      refreshHeldDisplay();
      hideCellMenu();
    });
    cellMenu.appendChild(grabBtn);
  } else {
    // If player already holds a token, show a disabled info line
    if (heldToken !== null) {
      const info = document.createElement("div");
      info.textContent = "You are already holding a token.";
      info.style.marginBottom = "6px";
      cellMenu.appendChild(info);
    } else if (cell.token === null) {
      const info = document.createElement("div");
      info.textContent = "No token in this cell.";
      info.style.marginBottom = "6px";
      cellMenu.appendChild(info);
    }
  }

  // Position the menu at the cell center on the screen
  const containerPoint = map.latLngToContainerPoint(cell.center);
  const mapRect = map.getContainer().getBoundingClientRect();
  // map container top-left in page coordinates:
  const mapLeft = mapRect.left + globalThis.scrollX;
  const mapTop = mapRect.top + globalThis.scrollY;

  // place menu slightly offset so it doesn't overlap the exact click point
  const left = Math.round(mapLeft + containerPoint.x + 8);
  const top = Math.round(mapTop + containerPoint.y - 8);

  cellMenu.style.left = `${left}px`;
  cellMenu.style.top = `${top}px`;
  cellMenu.style.display = "block";
}

// Hide the cell menu
function hideCellMenu() {
  cellMenu.style.display = "none";
  cellMenu.innerHTML = "";
}

// Initialize cells around the classroom
for (let i = -NEIGHBORHOOD_RADIUS; i <= NEIGHBORHOOD_RADIUS; i++) {
  for (let j = -NEIGHBORHOOD_RADIUS; j <= NEIGHBORHOOD_RADIUS; j++) {
    const b = boundsFor(i, j);
    const center = b.getCenter();

    // Decide token deterministically
    const token = initialTokenFor(i, j);

    // Only create an interactive rectangle if the cell actually has a token.
    // Cells without tokens will not be clickable.
    let rect: leaflet.Rectangle | undefined = undefined;
    if (token !== null) {
      rect = leaflet
        .rectangle(b, {
          color: "transparent",
          weight: 1,
          fillOpacity: 0,
          interactive: true,
        })
        .addTo(map);

      // If token exists, bind a permanent tooltip so players see token values
      rect.bindTooltip(String(token), {
        permanent: true,
        direction: "center",
        className: "cell-label",
      });

      // Make rectangle clickable: open the menu for that cell
      rect.on("click", (ev: leaflet.LeafletMouseEvent) => {
        if (ev.originalEvent) ev.originalEvent.stopPropagation();
        showCellMenuFor({ i, j, bounds: b, center, token, rect });
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

// Simple style for the tooltip labels; adjust in style.css as needed
const style = document.createElement("style");
style.innerHTML = `
  .cell-label {
    font-weight: bold;
    color: #222;
    background: rgba(255,255,255,0.9);
    border-radius: 3px;
    padding: 0 4px;
    font-size: 12px;
  }
`;
document.head.append(style);
