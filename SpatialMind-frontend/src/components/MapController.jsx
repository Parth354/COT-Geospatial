import { useMap } from "react-leaflet";
import { useAppContext } from "../hooks/AppContext";
import { useEffect } from "react";


const MapController = () => {
  const map = useMap();
  const { state, actions } = useAppContext();
  const { mapCenter, mapZoom, mapFitBounds } = state;

  useEffect(() => {
    if (mapCenter && mapZoom) {
      map.setView(mapCenter, mapZoom);
    }
  }, [mapCenter, mapZoom, map]);

  useEffect(() => {
    if (mapFitBounds) {
        map.fitBounds([
            [mapFitBounds.south, mapFitBounds.west],
            [mapFitBounds.north, mapFitBounds.east]
        ], { padding: [40, 40] });
        actions.setMapView(null, null, null); 
    }
  }, [mapFitBounds, map, actions]);

  return null;
};
export default MapController;