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
const _CACHE_SPAWN_PROBABILITY = 0.1;

// New: how many cells away the player may interact
const INTERACTION_RADIUS = 3;

// Create basic UI elements
const controlPanelDiv = document.createElement("div");
controlPanelDiv.id = "controlPanel";
document.body.append(controlPanelDiv);

// Virtual movement controls (up / down / left / right)
// Moved to bottom-left of the screen
controlPanelDiv.style.position = "fixed";
controlPanelDiv.style.left = "175px";
controlPanelDiv.style.bottom = "12px";
controlPanelDiv.style.zIndex = "1000";
controlPanelDiv.style.display = "grid";
controlPanelDiv.style.gridTemplateColumns = "repeat(3, 40px)";
controlPanelDiv.style.gridGap = "6px";
controlPanelDiv.style.alignItems = "center";
controlPanelDiv.style.justifyItems = "center";
controlPanelDiv.style.background = "rgba(255,255,255,0.9)";
controlPanelDiv.style.padding = "8px";
controlPanelDiv.style.border = "1px solid #ccc";
controlPanelDiv.style.borderRadius = "6px";
controlPanelDiv.style.boxShadow = "0 2px 6px rgba(0,0,0,0.1)";

function mkBtn(label: string, onClick: () => void) {
  const b = document.createElement("button");
  b.textContent = label;
  b.style.width = "40px";
  b.style.height = "32px";
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

// empty placeholders for grid layout
controlPanelDiv.appendChild(document.createElement("div"));
controlPanelDiv.appendChild(mkBtn("↑", () => movePlayerByCells(1, 0)));
controlPanelDiv.appendChild(document.createElement("div"));
controlPanelDiv.appendChild(mkBtn("←", () => movePlayerByCells(0, -1)));
controlPanelDiv.appendChild(document.createElement("div"));
controlPanelDiv.appendChild(mkBtn("→", () => movePlayerByCells(0, 1)));
controlPanelDiv.appendChild(document.createElement("div"));
controlPanelDiv.appendChild(mkBtn("↓", () => movePlayerByCells(-1, 0)));
controlPanelDiv.appendChild(document.createElement("div"));

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

// Track player's current lat/lng (playerMarker is created below)
let playerLatLng = CLASSROOM_LATLNG;

// Helper to get player's current cell indices
function getPlayerCell() {
  return latLngToCell(playerLatLng.lat, playerLatLng.lng);
}

// Returns true if the player is within INTERACTION_RADIUS cells of (i,j)
function withinInteraction(i: number, j: number) {
  const p = getPlayerCell();
  return Math.abs(i - p.i) <= INTERACTION_RADIUS &&
    Math.abs(j - p.j) <= INTERACTION_RADIUS;
}

// Grid data structure — make rect optional so cells without tokens don't hold an interactive rectangle
type Cell = {
  i: number;
  j: number;
  bounds: leaflet.LatLngBounds;
  center: leaflet.LatLng;
  token: number | null;
  rect?: leaflet.Rectangle | undefined;
};
// eager global cells map removed to implement Flyweight:
// const cells = new Map<string, Cell>();

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

// Helper to hide the cell menu
function hideCellMenu() {
  cellMenu.style.display = "none";
}

// Close menu when clicking outside
document.addEventListener("click", (ev) => {
  const target = ev.target as Node;
  if (!cellMenu.contains(target)) hideCellMenu();
});

// Helper to show menu for a cell (positions near the cell center on the map)
function showCellMenuFor(cell: Cell) {
  // Clear previous contents
  cellMenu.innerHTML = "";

  // Show latitude / longitude instead of grid indices
  const title = document.createElement("div");
  title.textContent = `Lat: ${cell.center.lat.toFixed(6)}, Lng: ${
    cell.center.lng.toFixed(6)
  }`;
  title.style.fontWeight = "600";
  title.style.marginBottom = "6px";
  cellMenu.appendChild(title);

  // Case: cell has a token and player holds none -> offer Grab
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
      // Remove tooltip and interactive rectangle so cell is no longer clickable
      cell.rect?.unbindTooltip();
      cell.rect?.remove();
      cell.rect = undefined;
      // Persist memento if cell differs from deterministic initial state
      const key = cellKey(cell.i, cell.j);
      const initial = initialTokenFor(cell.i, cell.j);
      if (cell.token !== initial) modifiedCells.set(key, { token: cell.token });
      else modifiedCells.delete(key);
      refreshHeldDisplay();
      hideCellMenu();
    });
    cellMenu.appendChild(grabBtn);

    // New: cell empty and player holds a token -> allow placing any token into the cell
  } else if (cell.token === null && heldToken !== null) {
    const placeBtn = document.createElement("button");
    placeBtn.textContent = `Place ${heldToken}`;
    placeBtn.style.display = "block";
    placeBtn.style.width = "100%";
    placeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      // Place the held token into the cell
      const placedValue = heldToken!;
      heldToken = null;
      // create visual rect + tooltip if not present
      if (!cell.rect) {
        cell.rect = leaflet.rectangle(cell.bounds, {
          color: "transparent",
          weight: 1,
          fillOpacity: 0,
          interactive: true,
        }).addTo(map);
        // bind click to the rectangle to reopen menu for this cell
        cell.rect.on("click", (ev: leaflet.LeafletMouseEvent) => {
          if (ev.originalEvent) ev.originalEvent.stopPropagation();
          handleCellClick(cell);
        });
      }
      // bind tooltip to show the new token value (unbind existing to be safe)
      try {
        cell.rect.unbindTooltip();
      } catch {
        // ignore errors if there was no tooltip bound or it was already removed
      }
      cell.rect.bindTooltip(String(placedValue), {
        permanent: true,
        direction: "center",
        className: "cell-label",
      });
      cell.token = placedValue;

      // Persist memento if cell differs from deterministic initial state
      const key = cellKey(cell.i, cell.j);
      const initial = initialTokenFor(cell.i, cell.j);
      if (cell.token !== initial) modifiedCells.set(key, { token: cell.token });
      else modifiedCells.delete(key);

      refreshHeldDisplay();
      // ensure transparency updates immediately
      updateCellTransparency(cell);
      hideCellMenu();
    });
    cellMenu.appendChild(placeBtn);
  } else if (cell.token !== null && heldToken !== null) {
    // Player holds a token and cell has a token -> possible craft
    if (heldToken === cell.token) {
      // Show Craft button
      const craftBtn = document.createElement("button");
      craftBtn.textContent = `Craft (merge ${heldToken} + ${cell.token})`;
      craftBtn.style.display = "block";
      craftBtn.style.width = "100%";
      craftBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        // Double the held token, remove token from cell, remove rect/tooltip
        heldToken = heldToken! * 2;
        cell.token = null;
        cell.rect?.unbindTooltip();
        cell.rect?.remove();
        cell.rect = undefined;
        // Persist memento if cell differs from deterministic initial state
        const key = cellKey(cell.i, cell.j);
        const initial = initialTokenFor(cell.i, cell.j);
        if (cell.token !== initial) {
          modifiedCells.set(key, { token: cell.token });
        } else modifiedCells.delete(key);
        refreshHeldDisplay();
        hideCellMenu();
      });
      cellMenu.appendChild(craftBtn);
    } else {
      // Cannot craft: values differ — provide contextual explanation
      const info = document.createElement("div");
      info.textContent =
        `Cannot craft: held (${heldToken}) ≠ cell (${cell.token}). Values must match.`;
      info.style.marginBottom = "6px";
      cellMenu.appendChild(info);
    }
  } else {
    // Other informative states
    if (heldToken !== null && cell.token === null) {
      const info = document.createElement("div");
      info.textContent = "You are holding a token. Click Place to put it here.";
      info.style.marginBottom = "6px";
      cellMenu.appendChild(info);
    } else if (heldToken === null && cell.token === null) {
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

// New: show a short menu explaining the cell is out of range
function showCellMenuTooFar(cell: Cell) {
  cellMenu.innerHTML = "";
  const title = document.createElement("div");
  title.textContent = `Lat: ${cell.center.lat.toFixed(6)}, Lng: ${
    cell.center.lng.toFixed(6)
  }`;
  title.style.fontWeight = "600";
  title.style.marginBottom = "6px";
  cellMenu.appendChild(title);

  const p = getPlayerCell();
  const dx = Math.abs(cell.i - p.i);
  const dy = Math.abs(cell.j - p.j);
  const info = document.createElement("div");
  info.textContent =
    `Too far to interact (distance: ${dx}, ${dy}). Move within ${INTERACTION_RADIUS} cells.`;
  info.style.marginBottom = "6px";
  cellMenu.appendChild(info);

  const containerPoint = map.latLngToContainerPoint(cell.center);
  const mapRect = map.getContainer().getBoundingClientRect();
  const mapLeft = mapRect.left + globalThis.scrollX;
  const mapTop = mapRect.top + globalThis.scrollY;
  const left = Math.round(mapLeft + containerPoint.x + 8);
  const top = Math.round(mapTop + containerPoint.y - 8);

  cellMenu.style.left = `${left}px`;
  cellMenu.style.top = `${top}px`;
  cellMenu.style.display = "block";
}

// New: central click handler that enforces interaction distance
function handleCellClick(cell: Cell) {
  if (!withinInteraction(cell.i, cell.j)) {
    // If out of range, show explanatory menu
    showCellMenuTooFar(cell);
    return;
  }
  // Otherwise, show the normal menu
  showCellMenuFor(cell);
}

// Developer: allow virtual movement by right-clicking the map (contextmenu).
// Right-click will move the player marker to the clicked location and update status.

function movePlayerTo(latlng: leaflet.LatLng) {
  // Move marker
  playerMarker.setLatLng(latlng);

  // Update tracked player lat/lng for interaction checks
  playerLatLng = latlng;

  // Compute which cell the player is now in (for dev feedback)
  const cell = latLngToCell(latlng.lat, latlng.lng);

  // Update status panel with developer location info
  statusPanelDiv.innerText =
    `Dev moved player to cell ${cell.i},${cell.j} (lat:${
      latlng.lat.toFixed(
        6,
      )
    }, lng:${latlng.lng.toFixed(6)})`;

  // update visuals for visible cells
  refreshAllTransparencies();

  console.info("Developer moved player to:", cell, latlng);
}

// Handle right-click (contextmenu) on the map to move player
map.on("contextmenu", (ev: leaflet.LeafletMouseEvent) => {
  // Prevent default browser menu
  if (ev.originalEvent) ev.originalEvent.preventDefault();
  // Stop propagation so our global click handler doesn't immediately hide menus
  if (ev.originalEvent) ev.originalEvent.stopPropagation();

  // Move the player marker to the clicked location
  movePlayerTo(ev.latlng);
});

// Utility: log an example mapping and counts for quick verification
const example = latLngToCell(CLASSROOM_LATLNG.lat, CLASSROOM_LATLNG.lng);
// console.info moved below after visibleCells is declared to avoid using the variable before initialization

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

// Move player by di (lat steps) and dj (lng steps)
function movePlayerByCells(di: number, dj: number) {
  const newLat = playerLatLng.lat + di * TILE_DEGREES;
  const newLng = playerLatLng.lng + dj * TILE_DEGREES;
  const newLatLng = leaflet.latLng(newLat, newLng);
  // move marker and update tracked position
  movePlayerTo(newLatLng);
  // keep the map centered on the player for dev convenience
  map.panTo(newLatLng);
}

// Flyweight memento store: only cells modified by the player are persisted here.
type CellMemento = { token: number | null };
const modifiedCells = new Map<string, CellMemento>();

// Keep track of currently rendered (visible) cells only.
// When a cell is removed from `visibleCells` we fully forget its runtime visuals.
const visibleCells = new Map<string, Cell>();

// Compute integer cell ranges that cover a Leaflet bounds object.
function visibleRangeForBounds(bounds: leaflet.LatLngBounds) {
  const south = bounds.getSouth();
  const north = bounds.getNorth();
  const west = bounds.getWest();
  const east = bounds.getEast();

  const iMin = Math.floor((south - CLASSROOM_LATLNG.lat) / TILE_DEGREES);
  const iMax = Math.floor((north - CLASSROOM_LATLNG.lat) / TILE_DEGREES);
  const jMin = Math.floor((west - CLASSROOM_LATLNG.lng) / TILE_DEGREES);
  const jMax = Math.floor((east - CLASSROOM_LATLNG.lng) / TILE_DEGREES);

  // Add a 1-cell padding so UI doesn't hiccup on fast pans
  return {
    iMin: iMin - 1,
    iMax: iMax + 1,
    jMin: jMin - 1,
    jMax: jMax + 1,
  };
}

// Update transparency for a single visible cell based on player distance
function updateCellTransparency(cell: Cell) {
  if (!cell.rect) return;
  const p = getPlayerCell();
  const dx = Math.abs(cell.i - p.i);
  const dy = Math.abs(cell.j - p.j);
  const inRange = dx <= INTERACTION_RADIUS && dy <= INTERACTION_RADIUS;

  // Make out-of-range cells mostly transparent
  cell.rect.setStyle({ opacity: inRange ? 1.0 : 0.35, fillOpacity: 0 });

  // Also adjust tooltip element opacity if present
  try {
    const tooltip = cell.rect.getTooltip && cell.rect.getTooltip();
    const tipEl = tooltip && tooltip.getElement && tooltip.getElement();
    if (tipEl instanceof HTMLElement) {
      tipEl.style.opacity = inRange ? "1" : "0.45";
    }
  } catch {
    // ignore if tooltip element not available
  }
}

// Refresh transparencies for all currently visible cells
function refreshAllTransparencies() {
  for (const cell of visibleCells.values()) updateCellTransparency(cell);
}

// Ensure new visible cells are styled correctly when spawned
// (spawn interactive rectangle for every visible cell so empty cells can be clicked/placed into)
function spawnVisibleCell(i: number, j: number) {
  const key = cellKey(i, j);
  if (visibleCells.has(key)) return visibleCells.get(key)!;

  const b = boundsFor(i, j);
  const center = b.getCenter();

  // Restore from modified memento if present; otherwise compute deterministic initial state
  const fromMemento = modifiedCells.get(key);
  const token = fromMemento ? fromMemento.token : initialTokenFor(i, j);

  // Always create an interactive rectangle so empty cells are clickable (for placing tokens)
  const rect = leaflet
    .rectangle(b, {
      color: "transparent",
      weight: 1,
      fillOpacity: 0,
      interactive: true,
    })
    .addTo(map);

  // If token exists, show its tooltip; otherwise no tooltip (but cell is still clickable)
  if (token !== null) {
    rect.bindTooltip(String(token), {
      permanent: true,
      direction: "center",
      className: "cell-label",
    });
  }

  const cell: Cell = { i, j, bounds: b, center, token, rect };
  visibleCells.set(key, cell);

  // Click handler should reference the live visibleCells entry so updates (place/grab) are reflected
  rect.on("click", (ev: leaflet.LeafletMouseEvent) => {
    if (ev.originalEvent) ev.originalEvent.stopPropagation();
    const live = visibleCells.get(key);
    if (live) handleCellClick(live);
  });

  // apply initial transparency based on current player position
  updateCellTransparency(cell);

  return cell;
}

// Fully remove a visible cell and forget its runtime state.
// Persist a memento only if the cell was modified relative to the deterministic initial state.
function despawnVisibleCell(key: string) {
  const cell = visibleCells.get(key);
  if (!cell) return;

  // remove any visual elements
  if (cell.rect) {
    try {
      cell.rect.unbindTooltip();
    } catch (_err) {
      // ignore errors from unbinding tooltip if the element was already removed
    }
    try {
      cell.rect.remove();
    } catch (_err) {
      // ignore errors from removing rectangle
    }
  }

  // Decide whether to persist this cell's contents.
  const [si, sj] = key.split(",").map(Number);
  const initial = initialTokenFor(si, sj);
  if (cell.token !== initial) {
    // player changed the cell -> save a small memento
    modifiedCells.set(key, { token: cell.token });
  } else {
    // no meaningful change -> ensure there's no lingering memento
    modifiedCells.delete(key);
  }

  visibleCells.delete(key);
}

// Recompute which cells should be visible based on current map bounds.
// Cells that leave the visible area are despawned (forgotten).
function updateVisibleCells() {
  const bounds = map.getBounds();
  const { iMin, iMax, jMin, jMax } = visibleRangeForBounds(bounds);

  // spawn required cells
  for (let i = iMin; i <= iMax; i++) {
    for (let j = jMin; j <= jMax; j++) {
      spawnVisibleCell(i, j);
    }
  }

  // despawn cells outside range
  for (const key of Array.from(visibleCells.keys())) {
    const [si, sj] = key.split(",").map(Number);
    if (si < iMin || si > iMax || sj < jMin || sj > jMax) {
      despawnVisibleCell(key);
    }
  }
}

// Hook into map movement so we spawn/despawn as the viewport changes
map.on("moveend", () => {
  updateVisibleCells();
});

// Hook into map movement so we spawn/despawn as the viewport changes
map.on("moveend", () => {
  updateVisibleCells();
});

// Ensure update runs on startup
updateVisibleCells();

// Now that visibleCells has been declared/initialized, log the example and count
console.info(
  "Classroom cell:",
  example,
  "Total visible cells:",
  visibleCells.size,
);

// Movement facade + backends (Facade pattern)
// Provides a uniform interface for player movement so the rest of the game
// does not depend on whether movement is button-based or from geolocation.
type MoveCallback = (latlng: leaflet.LatLng) => void;

interface MovementBackend {
  start(): void;
  stop(): void;
  setMoveCallback(cb: MoveCallback | null): void;
  name: string;
}

class ButtonMover implements MovementBackend {
  private cb: MoveCallback | null = null;
  name = "buttons";
  start() {/* nothing to start for buttons */}
  stop() {/* nothing to stop */}
  setMoveCallback(cb: MoveCallback | null) {
    this.cb = cb;
  }
  moveByCells(di: number, dj: number) {
    if (!this.cb) return;
    const newLat = playerLatLng.lat + di * TILE_DEGREES;
    const newLng = playerLatLng.lng + dj * TILE_DEGREES;
    this.cb(leaflet.latLng(newLat, newLng));
  }
}

class GeoMover implements MovementBackend {
  private cb: MoveCallback | null = null;
  private watchId: number | null = null;
  name = "geolocation";
  start() {
    if (!("geolocation" in navigator)) return;
    if (this.watchId != null) return;
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        this.cb?.(leaflet.latLng(lat, lng));
      },
      (err) => console.warn("Geolocation error", err),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 },
    );
  }
  stop() {
    if (this.watchId != null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }
  setMoveCallback(cb: MoveCallback | null) {
    this.cb = cb;
  }
}

class MovementFacade {
  private backends: Record<string, MovementBackend> = {};
  private active: MovementBackend;
  constructor(initial: MovementBackend, others: MovementBackend[] = []) {
    this.backends[initial.name] = initial;
    for (const b of others) this.backends[b.name] = b;
    this.active = initial;
  }
  activate(name: string) {
    if (this.active.name === name) return;
    this.active.stop();
    const next = this.backends[name];
    if (!next) return;
    this.active = next;
    this.active.start();
    this.active.setMoveCallback(movePlayerTo);
    controlPanelDiv.style.display = this.active.name === "buttons"
      ? "grid"
      : "none";
  }
  toggle() {
    const next = this.active.name === "buttons" ? "geolocation" : "buttons";
    this.activate(next);
  }
  setMoveCallback(cb: MoveCallback | null) {
    for (const b of Object.values(this.backends)) b.setMoveCallback(cb);
  }
  moveBy(di: number, dj: number) {
    if (this.active.name === "buttons") {
      (this.active as ButtonMover).moveByCells(di, dj);
    }
  }
  getMode() {
    return this.active.name;
  }
  start() {
    this.active.start();
  }
  stop() {
    this.active.stop();
  }
}

// instantiate facade and wire to game movement
const buttonMover = new ButtonMover();
const geoMover = new GeoMover();
const movementFacade = new MovementFacade(buttonMover, [geoMover]);
movementFacade.setMoveCallback(movePlayerTo);

// Rebuild control panel to use the facade (use the mkBtn defined earlier)
controlPanelDiv.innerHTML = "";
controlPanelDiv.appendChild(document.createElement("div"));
controlPanelDiv.appendChild(mkBtn("↑", () => movementFacade.moveBy(1, 0)));
controlPanelDiv.appendChild(document.createElement("div"));
controlPanelDiv.appendChild(mkBtn("←", () => movementFacade.moveBy(0, -1)));
controlPanelDiv.appendChild(document.createElement("div"));
controlPanelDiv.appendChild(mkBtn("→", () => movementFacade.moveBy(0, 1)));
controlPanelDiv.appendChild(document.createElement("div"));
controlPanelDiv.appendChild(mkBtn("↓", () => movementFacade.moveBy(-1, 0)));
controlPanelDiv.appendChild(document.createElement("div"));

// Movement toggle UI (bottom-left) — hides arrow keys when geolocation is active
const movementToggle = document.createElement("button");
movementToggle.id = "movementToggle";
movementToggle.style.position = "fixed";
movementToggle.style.left = "12px";
movementToggle.style.bottom = "64px";
movementToggle.style.zIndex = "1000";
movementToggle.style.padding = "6px 10px";
movementToggle.style.borderRadius = "6px";
movementToggle.style.border = "1px solid #333";
movementToggle.style.background = "white";
movementToggle.style.boxShadow = "0 2px 6px rgba(0,0,0,0.12)";
document.body.appendChild(movementToggle);

function refreshMovementToggleUI() {
  const mode = movementFacade.getMode();
  movementToggle.textContent = `Mode: ${
    mode === "buttons" ? "Buttons" : "Geolocation"
  }`;
  controlPanelDiv.style.display = mode === "buttons" ? "grid" : "none";
}

movementToggle.addEventListener("click", (e) => {
  e.stopPropagation();
  movementFacade.toggle();
  refreshMovementToggleUI();
  if (movementFacade.getMode() === "geolocation") movementFacade.start();
  else movementFacade.stop();
});

// initialize UI visibility according to current mode
refreshMovementToggleUI();
