import os
from app.llm.rag_retriever import RAGRetriever

def test_document_retrieval():
    # Provide your knowledge base name here
    knowledge_base = "faiss_index_india_flood_prone_areas"

    # Example tool_plan (this is what your agent usually generates)
    # Use realistic arguments you expect from your system
    tool_plan = [
        {"args": "uttar pradesh flood shapefile"},
        {"args": "bihar rainfall geojson"}
    ]

    retriever = RAGRetriever(knowledge_base)

    print("\n[TEST] Running document retrieval...\n")
    results = retriever.retrieve(tool_plan)

    for idx, retrieval in enumerate(results):
        print(f"Query {idx + 1}: {retrieval['query']}")
        print(f"FAISS Documents: {retrieval['faiss_docs']}")
        print(f"User Uploaded Files: {retrieval['user_files']}")
        print(f"System Files: {retrieval['system_files']}")
        print("-" * 60)

if __name__ == "__main__":
    test_document_retrieval()
