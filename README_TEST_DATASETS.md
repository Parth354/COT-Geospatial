# Test Datasets for SpatialMind

This directory contains test GeoJSON datasets for testing the SpatialMind geospatial analysis application.

## Available Test Datasets

### 1. `test_flood_areas_delhi.geojson`
**Purpose:** Test flood-prone area analysis and visualization

**Features:**
- 15 features total
- 10 polygon features (flood zones)
- 3 point features (monitoring stations)
- 2 point features (evacuation centers)
- Located in Delhi, India region
- Contains properties: risk_level, area_km2, population_affected, elevation_m, flood_frequency, last_flood

**Use Cases:**
- Testing flood risk analysis queries
- Testing spatial queries like "flood prone areas in Delhi"
- Testing feature count and visualization
- Testing property-based filtering

### 2. `test_urban_areas_delhi.geojson`
**Purpose:** Test urban area analysis and demographic queries

**Features:**
- 8 polygon features
- All located in Delhi, India region
- Contains properties: type, area_km2, population, density_per_km2, district

**Use Cases:**
- Testing urban area queries
- Testing population density analysis
- Testing district-based queries
- Testing area calculations

## How to Use

1. **Upload the dataset:**
   - Open the SpatialMind application
   - Go to the "Data" tab
   - Drag and drop one of the test GeoJSON files or click to browse
   - Fill in metadata (name, description) and upload

2. **Process the dataset:**
   - After upload, click the "Process" button (database icon) on the dataset
   - Wait for ingestion to complete (status will change to "Ready")

3. **Add to map:**
   - Click the "Add to Map" button (layers icon) on processed datasets
   - The features should appear on the map

4. **Test queries:**
   - Try queries like:
     - "Show me flood prone areas in Delhi"
     - "What are the high risk flood zones?"
     - "Display urban areas with population density above 20000"
     - "Find areas with elevation below 210 meters"

## Dataset Details

### Flood Areas Dataset
- **Total Features:** 15
- **Polygons:** 10
- **Points:** 5
- **Coordinate System:** WGS84 (EPSG:4326)
- **Bounding Box:** 
  - West: 77.05
  - East: 77.35
  - South: 28.42
  - North: 28.78

### Urban Areas Dataset
- **Total Features:** 8
- **Polygons:** 8
- **Coordinate System:** WGS84 (EPSG:4326)
- **Bounding Box:**
  - West: 77.05
  - East: 77.35
  - South: 28.42
  - North: 28.75

## Expected Results

After uploading and processing:
- ✅ Feature count should show correctly (15 for flood areas, 8 for urban areas)
- ✅ Features should be visible on the map
- ✅ Properties should be accessible in popups
- ✅ Queries should work with these datasets
- ✅ Spatial analysis operations should function correctly

## Troubleshooting

If you see zero feature count:
1. Check that the file is valid GeoJSON (use a JSON validator)
2. Ensure the file was fully uploaded
3. Check backend logs for ingestion errors
4. Verify the dataset status shows "processed" not "ingestion_failed"
5. Try re-processing the dataset

## Notes

- These datasets are for testing purposes only
- Coordinates are approximate and represent test data
- Real-world analysis would require actual survey data
- The datasets are designed to work with the default map center (Delhi region)

