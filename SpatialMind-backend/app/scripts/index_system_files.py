import os
from pathlib import Path
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_core.documents import Document

SUPPORTED_EXTS = {".geojson", ".shp", ".kml", ".csv", ".tif", ".tiff" ,".shx", ".dbf", ".prj", ".cpg"}

def get_file_documents(directory: Path):
    docs = []
    for root, _, files in os.walk(directory):
        for f in files:
            ext = Path(f).suffix.lower()
            if ext in SUPPORTED_EXTS:
                full_path = Path(root) / f
                content = f"Filename: {f}, Path: {str(full_path)}"
                docs.append(Document(page_content=content, metadata={"path": str(full_path)}))
    return docs

def index_files(base_dir="app/llm/knowledge_base/system_files", index_name="faiss_index_system_files"):
    embedder = HuggingFaceEmbeddings(model_name="sentence-transformers/all-mpnet-base-v2")
    docs = get_file_documents(Path(base_dir))

    if not docs:
        print("No valid files found.")
        return

    vectorstore = FAISS.from_documents(docs, embedder)
    save_path = Path("app/llm/knowledge_base") / index_name
    vectorstore.save_local(str(save_path))
    print(f"Indexed {len(docs)} documents to {save_path}")

if __name__ == "__main__":
    index_files()