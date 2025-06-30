import React, { useState } from "react";
import { FileText, Layers, CheckCircle, Loader, AlertTriangle, Database, X } from "lucide-react";
import { useAppContext } from "../hooks/AppContext";
import {datasetsAPI} from "../api/datasetsAPI.js";
import {layerAPI} from "../api/layerAPI.js";

const DatasetItem = React.memo(({ dataset }) => {
    const { state, actions } = useAppContext();
    const [isDeleting, setIsDeleting] = useState(false);
    const [isStartingIngest, setIsStartingIngest] = useState(false);

    const isLayerOnMap = state.mapLayers.some(l => l.layerId === dataset.dataset_id);

    const handleRemove = async () => {
        if (window.confirm(`Are you sure you want to permanently delete '${dataset.name}'?`)) {
            setIsDeleting(true);
            try {
                await datasetsAPI.deleteDataset(dataset.dataset_id, actions);
                if (isLayerOnMap) {
                    actions.removeMapLayer(dataset.dataset_id);
                }
            } catch (err) {
                console.error("Failed to delete dataset:", err);
            } finally {
                setIsDeleting(false);
            }
        }
    };

    const handleIngest = async () => {
        setIsStartingIngest(true);
        try {
            await layerAPI.ingestDataset(dataset.dataset_id, actions);
        } catch (err) {
            console.error("Failed to start ingestion:", err);
        } finally {
            setIsStartingIngest(false);
        }
    };

    const handleAddToMap = () => {
        if (dataset.status === 'processed' && !isLayerOnMap) {
            actions.addMapLayer({
                layerId: dataset.dataset_id,
                name: dataset.name,
                visible: true,
                type: 'vector',
                style: dataset.style || {}
            });
        }
    };

    const renderStatusAndActions = () => {
        if (dataset.file_type && (dataset.file_type.toLowerCase().includes('tiff') || dataset.file_type.toLowerCase().includes('cog'))) {
            return (
                <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">Raster</span>
                    {!isLayerOnMap ? (
                        <button
                            onClick={handleAddToMap}
                            className="p-1.5 rounded text-blue-600 hover:bg-blue-100"
                            title="Add raster layer to map"
                        >
                            <Layers className="h-4 w-4" />
                        </button>
                    ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 flex items-center gap-1.5" title="Layer is visible on the map">
                            <CheckCircle className="h-3 w-3" /> On Map
                        </span>
                    )}
                </div>
            );
        }

        switch (dataset.status) {
            case 'ingesting':
                return (
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 flex items-center gap-1.5">
                        <Loader className="h-3 w-3 animate-spin" /> Processing
                    </span>
                );

            case 'processed':
                return (
                    <div className="flex items-center space-x-2">
                        {isLayerOnMap ? (
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 flex items-center gap-1.5" title="Layer is visible on the map">
                                <CheckCircle className="h-3 w-3" /> On Map
                            </span>
                        ) : (
                            <>
                                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                                    Ready
                                </span>
                                <button
                                    onClick={handleAddToMap}
                                    className="p-1.5 rounded text-blue-600 hover:bg-blue-100"
                                    title="Add layer to map"
                                >
                                    <Layers className="h-4 w-4" />
                                </button>
                            </>
                        )}
                    </div>
                );

            case 'ingestion_failed':
                return (
                    <div className="flex items-center space-x-2">
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 flex items-center gap-1.5" title="Processing failed - click retry to try again">
                            <AlertTriangle className="h-3 w-3" /> Failed
                        </span>
                        <button
                            onClick={handleIngest}
                            disabled={isStartingIngest}
                            className="p-1.5 rounded text-orange-600 hover:bg-orange-100 disabled:opacity-50"
                            title="Retry processing this dataset"
                        >
                            {isStartingIngest ? <Loader className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                        </button>
                    </div>
                );

            case 'uploaded':
            default:
                return (
                    <div className="flex items-center space-x-2">
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">
                            Uploaded
                        </span>
                        <button
                            onClick={handleIngest}
                            disabled={isStartingIngest}
                            className="p-1.5 rounded text-blue-600 hover:bg-blue-100 disabled:opacity-50"
                            title="Process this dataset to make it viewable on the map"
                        >
                            {isStartingIngest ? <Loader className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                        </button>
                    </div>
                );
        }
    };

    return (
        <div className="p-3 bg-gray-50 rounded-md flex items-center justify-between transition-colors hover:bg-gray-100">
            <div className="flex items-center space-x-3 min-w-0">
                <FileText className="h-5 w-5 text-gray-500 flex-shrink-0" />
                <div className="flex-grow min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate" title={dataset.name}>{dataset.name}</p>
                    <p className="text-xs text-gray-500 truncate">
                        {dataset.file_type} • {dataset.size_mb?.toFixed(2)} MB
                        {dataset.status && (
                            <span className="ml-2 text-gray-400">
                                • {dataset.status === 'uploaded' ? 'Needs processing' :
                                    dataset.status === 'ingesting' ? 'Processing...' :
                                        dataset.status === 'processed' ? 'Ready for map' :
                                            dataset.status === 'ingestion_failed' ? 'Processing failed' : dataset.status}
                            </span>
                        )}
                    </p>
                </div>
            </div>
            <div className="flex items-center space-x-2 flex-shrink-0">
                {renderStatusAndActions()}
                <button
                    onClick={handleRemove}
                    disabled={isDeleting}
                    className="p-1.5 rounded text-red-500 hover:bg-red-100 disabled:opacity-50"
                    title="Delete dataset permanently"
                >
                    {isDeleting ? <Loader className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                </button>
            </div>
        </div>
    );
});

DatasetItem.displayName = 'DatasetItem';

export default DatasetItem;
