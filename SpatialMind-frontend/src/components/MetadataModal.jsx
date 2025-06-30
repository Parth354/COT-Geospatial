import React,{ useState } from "react";


const MetadataModal = ({ file, onUpload, onCancel }) => {
    const [name, setName] = useState(file.name);
    const [description, setDescription] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        onUpload({ name: name || file.name, description });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onMouseDown={onCancel}>
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md animate-fade-in" onMouseDown={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-semibold mb-1">Upload Details</h3>
                <p className="text-sm text-gray-500 mb-4 truncate">Details for <span className="font-medium">{file.name}</span>.</p>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="name" className="block text-sm font-medium mb-1">Display Name</label>
                        <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full p-2 border rounded-md" required />
                    </div>
                    <div>
                        <label htmlFor="description" className="block text-sm font-medium mb-1">Description (Optional)</label>
                        <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows="3" className="w-full p-2 border rounded-md"></textarea>
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium bg-gray-100 rounded-md hover:bg-gray-200">Cancel</button>
                        <button type="submit" className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">Start Upload</button>
                    </div>
                </form>
            </div>
            <style>{`.animate-fade-in { animation: fadeIn 0.2s ease-out forwards; } @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
        </div>
    );
};

export default MetadataModal;