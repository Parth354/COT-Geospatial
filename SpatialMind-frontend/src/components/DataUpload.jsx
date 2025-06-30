import React, { useState, useRef, useCallback } from 'react';
import { Upload, FileText, X, CheckCircle, AlertTriangle, Loader, Layers, Database } from 'lucide-react';
import { useAppContext } from '../hooks/AppContext';
import DatasetItem from './DataSeItem.jsx';
import MetadataModal from './MetadataModal.jsx';
import { uploadAPI } from '../api/uploadAPI.js';

function DataUpload() {
    const { state, actions } = useAppContext();
    const [dragActive, setDragActive] = useState(false);
    const [uploadProgress, setUploadProgress] = useState({});
    const [stagedFile, setStagedFile] = useState(null);
    const fileInputRef = useRef(null);

    const processFile = useCallback(async (file, metadata) => {
        const fileId = `${file.name}-${file.lastModified}`;
        setUploadProgress(prev => ({ ...prev, [fileId]: { progress: 0, status: 'uploading' } }));

        try {
            await uploadAPI.uploadFile({ 
                file, 
                metadata, 
                onProgress: (p) => setUploadProgress(prev => ({ 
                    ...prev, 
                    [fileId]: { ...prev[fileId], progress: p } 
                })) 
            }, actions);

            setUploadProgress(prev => ({ ...prev, [fileId]: { progress: 100, status: 'completed' } }));
            
            setTimeout(() => {
                setUploadProgress(prev => {
                    const newProgress = { ...prev };
                    delete newProgress[fileId];
                    return newProgress;
                });
            }, 3000);
        } catch (error) {
            console.error("Upload failed:", error);
            setUploadProgress(prev => ({ 
                ...prev, 
                [fileId]: { status: 'error', error: error.message } 
            }));
            
            setTimeout(() => {
                setUploadProgress(prev => {
                    const newProgress = { ...prev };
                    delete newProgress[fileId];
                    return newProgress;
                });
            }, 8000);
        }
    }, [actions]);

    const handleFileSelected = useCallback((files) => {
        const file = Array.from(files).find(f => f.size > 0);
        if (file) setStagedFile(file);
    }, []);

    const handleModalUpload = useCallback((metadata) => {
        if (stagedFile) {
            processFile(stagedFile, metadata);
        }
        setStagedFile(null);
    }, [stagedFile, processFile]);

    const handleDrag = (e) => { e.preventDefault(); e.stopPropagation(); };
    const handleDragIn = (e) => { handleDrag(e); setDragActive(true); };
    const handleDragOut = (e) => { handleDrag(e); setDragActive(false); };
    const handleDrop = (e) => {
        handleDrag(e);
        setDragActive(false);
        if (e.dataTransfer.files?.length) {
            handleFileSelected(e.dataTransfer.files);
        }
    };

    const handleInputChange = (e) => {
        e.preventDefault();
        if (e.target.files?.length) {
            handleFileSelected(e.target.files);
        }
        e.target.value = ''; // Reset input
    };

    return (
        <div className="space-y-4 p-4 bg-gray-100 h-full overflow-y-auto">
            {stagedFile && (
                <MetadataModal 
                    file={stagedFile} 
                    onUpload={handleModalUpload} 
                    onCancel={() => setStagedFile(null)} 
                />
            )}
            
            {/* Upload Area */}
            <div className="bg-white rounded-lg shadow-sm border p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Data Management</h3>
                <div 
                    onClick={() => fileInputRef.current?.click()} 
                    onDragEnter={handleDragIn} 
                    onDragLeave={handleDragOut} 
                    onDragOver={handleDrag} 
                    onDrop={handleDrop} 
                    className={`border-2 border-dashed rounded-lg p-6 text-center transition-all cursor-pointer ${
                        dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'
                    }`}
                >
                    <Upload className="h-10 w-10 mx-auto text-gray-400 mb-2" />
                    <p className="font-medium text-gray-700">
                        Drop file or <span className="text-blue-600">browse</span>
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                        GeoJSON, Shapefile (.zip), KML, GeoTIFF, etc.
                    </p>
                    <input 
                        ref={fileInputRef} 
                        type="file" 
                        onChange={handleInputChange} 
                        className="hidden" 
                        accept=".geojson,.json,.zip,.kml,.kmz,.tiff,.tif,.shp"
                    />
                </div>
            </div>

            {/* Upload Progress */}
            {Object.keys(uploadProgress).length > 0 && (
                <div className="bg-white rounded-lg shadow-sm border p-4 space-y-3">
                    <h4 className="text-sm font-medium text-gray-700">Upload Progress</h4>
                    {Object.entries(uploadProgress).map(([id, info]) => (
                        <div key={id} className="flex items-center gap-3">
                            <p className="text-sm text-gray-800 truncate flex-1">
                                {id.split('-').slice(0, -1).join('-')}
                            </p>
                            <div className="w-24 bg-gray-200 rounded-full h-2">
                                <div 
                                    className={`h-2 rounded-full transition-all ${
                                        info.status === 'completed' ? 'bg-green-500' : 
                                        info.status === 'error' ? 'bg-red-500' : 'bg-blue-500'
                                    }`} 
                                    style={{ width: `${info.progress || 0}%` }} 
                                />
                            </div>
                            {info.status === 'uploading' && <Loader className="h-4 w-4 animate-spin text-blue-500" />}
                            {info.status === 'completed' && <CheckCircle className="h-4 w-4 text-green-500" />}
                            {info.status === 'error' && <AlertTriangle className="h-4 w-4 text-red-500" title={info.error} />}
                        </div>
                    ))}
                </div>
            )}

            {/* Dataset List */}
            {state.uploadedDatasets.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm border p-4">
                    <h4 className="text-base font-semibold text-gray-800 mb-3">
                        Available Datasets ({state.uploadedDatasets.length})
                    </h4>
                    <div className="space-y-2 max-h-[calc(100vh-500px)] overflow-y-auto pr-2">
                        {state.uploadedDatasets
                            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                            .map((dataset) => (
                                <DatasetItem key={dataset.dataset_id} dataset={dataset} />
                            ))
                        }
                    </div>
                </div>
            )}
        </div>
    );
}

export default DataUpload;