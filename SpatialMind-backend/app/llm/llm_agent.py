# llm_agent.py
from app.llm.rag_retriever import RAGRetriever
from app.llm.tool_planner_factory import get_tool_planner
import time

class LLMChainOfThoughtAgent:
    def __init__(self, job_id, model_type="gemini"):
        self.job_id = job_id
        self.rag_retriever = RAGRetriever()
        self.tool_planner = get_tool_planner(model_type)
        self.tool_plan = None

    def parse_and_plan(self, query):
        step = {
            "type": "cot_step",
            "job_id": self.job_id,
            "step_number": 1,
            "step_type": "reasoning",
            "content": f"Parsed query '{query}'. Generating chain-of-thought steps.",
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ")
        }

        self.tool_plan = self.tool_planner.generate_tool_plan(query)

        return step

    def retrieve_documents(self):
        retrieved_docs = self.rag_retriever.retrieve(self.tool_plan)

        return {
            "type": "tool_execution",
            "job_id": self.job_id,
            "tool": "RAGRetriever",
            "status": "running",
            "progress": 20,
            "message": f"Retrieved {len(retrieved_docs)} relevant documents via RAG system"
        }
