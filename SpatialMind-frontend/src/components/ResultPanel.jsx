import React, { useState } from 'react'
import { Download, Eye, BarChart3, Map, Table, FileText, ExternalLink } from 'lucide-react'
import { useAppContext } from '../hooks/useAppContext'

function ResultPanel() {
  const { state, actions } = useAppContext()
  const [activeTab, setActiveTab] = useState('summary')

  if (!state.results) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="text-center text-gray-500 py-8">
          <BarChart3 className="h-12 w-12 mx-auto mb-4 text-gray-300" />
          <p>No analysis results yet</p>
          <p className="text-sm">Submit a query to see results here</p>
        </div>
      </div>
    )
  }

  const tabs = [
    { id: 'summary', label: 'Summary', icon: FileText },
    { id: 'data', label: 'Data', icon: Table },
    { id: 'maps', label: 'Maps', icon: Map },
    { id: 'metrics', label: 'Metrics', icon: BarChart3 }
  ]

  const downloadFile = async (file) => {
    try {
      const res = await fetch(`/api/download/${file.file_id}`)
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = file.name || 'downloaded_file'
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Download failed:', err)
    }
  }

  const addToMap = (layer) => {
    actions.addMapLayer({
      layerId: layer.layer_id,
      name: layer.name,
      type: layer.type,
      dataUrl: layer.data_url,
      legend: layer.legend,
      visible: true,
      style: layer.style || { color: '#ef4444', fillOpacity: 0.6 },
      bbox: layer.bbox
    })
  }

  const renderSummary = () => (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 mb-2">Analysis Complete</h4>
        <p className="text-blue-700 text-sm">{state.results.summary || 'Your query has been analyzed.'}</p>
      </div>
      {state.results.reportUrl && (
        <a href={state.results.reportUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-blue-600 text-sm font-medium hover:underline">
          <ExternalLink className="h-4 w-4 mr-1" /> Full Report
        </a>
      )}
    </div>
  )

  const renderDataTable = () => {
    const data = state.results.tabularData || []
    if (!data.length) {
      return (
        <div className="text-center text-gray-500 py-8">
          <Table className="h-8 w-8 mx-auto mb-2 text-gray-300" />
          <p>No tabular data available</p>
        </div>
      )
    }
    const columns = Object.keys(data[0])
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columns.map(col => (
                <th key={col} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.slice(0, 100).map((row, index) => (
              <tr key={index} className="hover:bg-gray-50">
                {columns.map(col => (
                  <td key={col} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row[col]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {data.length > 100 && (
          <div className="p-4 text-center text-sm text-gray-500">Showing first 100 rows of {data.length}</div>
        )}
      </div>
    )
  }

  const renderMaps = () => (
    <div className="space-y-4">
      {(state.results.mapLayers || []).map((layer, idx) => (
        <div key={idx} className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-gray-900">{layer.name}</h4>
            <div className="flex space-x-2">
              <button onClick={() => addToMap(layer)} className="btn btn-sm btn-outline"><Eye className="h-4 w-4 mr-1" />View</button>
              <button onClick={() => downloadFile({ file_id: layer.file_id, name: layer.name + '.geojson' })} className="btn btn-sm btn-outline"><Download className="h-4 w-4 mr-1" />Download</button>
            </div>
          </div>
          {layer.thumbnail && <img src={layer.thumbnail} alt={layer.name} className="w-full h-48 object-cover rounded" />}
          {layer.description && <p className="text-sm text-gray-600 mt-2">{layer.description}</p>}
        </div>
      ))}
    </div>
  )

  const renderMetrics = () => {
    const metrics = state.results.metrics || []
    return (
      <div className="space-y-4">
        <h4 className="font-medium text-gray-900">Key Metrics</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {metrics.map((metric, idx) => (
            <div key={idx} className="bg-blue-50 rounded-lg p-4">
              <div className="text-xl font-bold text-blue-900">{metric.value}</div>
              <div className="text-sm text-blue-700">{metric.label}</div>
              {metric.description && <div className="text-xs text-blue-600">{metric.description}</div>}
            </div>
          ))}
        </div>
      </div>
    )
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'summary': return renderSummary()
      case 'data': return renderDataTable()
      case 'maps': return renderMaps()
      case 'metrics': return renderMetrics()
      default: return renderSummary()
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      <div className="border-b p-4">
        <h3 className="text-lg font-semibold text-gray-900">Analysis Results</h3>
      </div>
      <div className="border-b">
        <nav className="flex space-x-4 px-4">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center space-x-1 py-3 px-2 text-sm font-medium border-b-2 transition-all ${
                activeTab === id
                  ? 'text-blue-600 border-blue-500'
                  : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>
      <div className="p-4">
        {renderTabContent()}
      </div>
    </div>
  )
}

export default ResultPanel
