# PLANS

## PLAN FOR D3.a

1. Read and understand main.ts
2. Replace main.ts with my own code
3. Set up Leaflet dependencies
4. Initialize grids to be approximately the size of a building
5. Initialize contents of a cell to have tokens (Using luck function)
6. Make the cells clickable and interactable and Make a graphic showing the contents within a cell (tokens and what value they have)
7. Make an inventory system
8. Make a crafting system
9. Add developer mode to let the player virtually move around
10. Tune and calibrate settings to fulfill gameplay requirements

## PLAN FOR D3.b

1. Create a button layout for virtual movement
2. Create dynamically spawning and despawning system for cells (Make sure to keep the screen populated)
3. Modify the cell coordinate system to use latitude and longitude
4. Create game rules so that victory shows up when the largest possible digit is achieved (currently 16)

## PLAN FOR D3.c

1. Implement flyweight pattern to cell data storage (effective data storage for when inactive)
2. Implement memento pattern to cell data storage (effective restoration when reactivating)

## PLAN FOR D3.d

1. Implement support for browser geolocation API (Make this toggleable between the old movement system using the Facade pattern)
2. Implement localStorage API so that cells remember their states
3. Implement a new game button
