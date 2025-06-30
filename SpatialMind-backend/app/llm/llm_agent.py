import json
import logging
import time
from typing import Any, Dict, List

from langchain_core.prompts import PromptTemplate
from langchain_community.tools import DuckDuckGoSearchRun

from app.llm.llm_factory import get_llm
from app.services.geoprocessing_service import ToolExecutor
from app.llm.rag_retriever import RAGRetriever
from app.core.redis_sync_client import redis_sync_client

# Logger setup
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("LLMChainOfThoughtAgent")


# ==============================================================================
# THE FIX: This updated prompt template explicitly forbids nested tool calls
# and provides a clear example of the correct, sequential workflow.
# ==============================================================================
COT_REACT_PROMPT_TEMPLATE = """
You are SpatialMind, an expert, autonomous geospatial analyst. Your sole purpose is to solve the user's query by developing a clear chain of thought and then executing a single, corresponding action in a loop.

**1. AVAILABLE DATA FILES (Must be loaded into memory before use):**
The following data files are available on disk. You MUST use the `load_data` tool to bring a file into memory before you can use it as an input for any other geospatial tool. The `asset_id` is the filename you must use with the `load_data` tool.
{data_context}

**2. AVAILABLE TOOLS:**
You have access to a suite of tools. You MUST choose ONE tool to execute per step.
{tool_docstrings}

**3. TOOL USAGE RULES (VERY IMPORTANT):**
- You MUST call tools one at a time.
- The 'input_layer' argument for any tool MUST be the string name of a layer that was already created by `load_data` or another tool in a PREVIOUS step.
- **DO NOT** nest tool calls like `buffer_layer(input_layer=load_data(...))`. This is invalid and will fail.

**Correct Workflow Example:**
1. **Thought:** I need to buffer the `BASIN_CWC.shp` file. First, I must load it into memory.
   **Action:** `{{"tool": "load_data", "args": {{"asset_id": "BASIN_CWC.shp", "output_name": "basins_in_memory"}}}}`
2. **Observation:** Success: Loaded 'BASIN_CWC.shp' as layer 'basins_in_memory' with 25 features.
3. **Thought:** Now that the 'basins_in_memory' layer exists, I can buffer it.
   **Action:** `{{"tool": "buffer_layer", "args": {{"input_layer": "basins_in_memory", "distance_meters": 10000, "output_name": "buffered_basins"}}}}`

**4. YOUR TASK & CURRENT STATE:**
- **User's Goal:** "{query}"
- **Workflow History (Previous Steps, Actions, and Observations):**
{history}

**5. RESPONSE FORMAT:**
You MUST respond with a single, valid JSON object and nothing else.
```json
{{
    "thought": {{
        "observation_summary": "Summarize the key outcomes from the last observation. Note anything unexpected or if a previous tool call failed.",
        "goal_analysis": "Re-evaluate the user's goal based on new information. Are you still on track? If the goal is complete, state that here.",
        "strategy_and_critique": "Brainstorm 1-2 next steps. Critique their pros and cons. If you made a mistake, identify it and plan a correction.",
        "recommendation": "State the single, best next action to take."
    }},
    "action": {{
        "tool": "tool_name",
        "args": {{"arg1": "value1"}}
    }}
}}
"""

class LLMChainOfThoughtAgent:
    def __init__(self, job_id: str, model_type: str = "gemini"):
        self.job_id = job_id
        self.llm = get_llm(model_type)
        self.tool_executor = ToolExecutor(job_id)
        self.rag_retriever = RAGRetriever(job_id)
        self.history: List[Dict[str, Any]] = []
        self.max_loops = 10
        self.ui_delay = 0.5

        # Register the web_search tool with the executor for unified handling
        self.tool_executor.register_tool(
            "web_search",
            DuckDuckGoSearchRun().run,
            "A tool for searching the internet. Use it to find recent information, data sources, or answer questions about topics not present in the available files. The input should be a concise search query string."
        )

    def _publish_ws(self, message_type: str, content: Dict):
        """Helper to send updates to the frontend via WebSocket."""
        logger.info(f"[WS] job={self.job_id} type={message_type} content={json.dumps(content)}")
        redis_sync_client.publish_websocket_message(
            self.job_id, {"type": message_type, **content, "timestamp": time.time()}
        )

    def _format_history(self) -> str:
        """Formats the agent's history into a string for the LLM's context."""
        if not self.history:
            return "No actions have been taken yet."
        return "\n\n".join(
            f"**Step {i+1}:**\n"
            f"- **Previous Thought**: {json.dumps(item['thought'], indent=2)}\n"
            f"- **Action Taken**: {json.dumps(item['action'])}\n"
            f"- **Resulting Observation**: {item['observation']}"
            for i, item in enumerate(self.history)
        )

    def _parse_llm_response(self, response_str: str) -> Dict[str, Any]:
        """Parses the LLM's raw string response, extracting the JSON object."""
        try:
            cleaned_response = response_str.strip().replace("```json", "").replace("```", "").strip()
            action_plan = json.loads(cleaned_response)
            if "thought" not in action_plan or "action" not in action_plan:
                raise ValueError("Missing 'thought' or 'action' keys in response.")
            return action_plan
        except Exception as e:
            logger.error(f"Failed to parse LLM response: {e} | Raw response: {response_str}")
            return {
                "thought": {
                    "observation_summary": "Critical error occurred while parsing the AI's response.",
                    "goal_analysis": "Cannot proceed due to invalid AI response format.",
                    "strategy_and_critique": "The AI provided a response that was not valid JSON.",
                    "recommendation": "Halt the process immediately to prevent errors."
                },
                "action": { "tool": "finish", "args": { "answer": "Critical error in AI reasoning module. Process halted." } }
            }

    def _get_next_thought_and_action(self, query: str) -> Dict[str, Any]:
        """Formats the prompt and gets the next structured thought and action from the LLM."""
        prompt_template = PromptTemplate.from_template(COT_REACT_PROMPT_TEMPLATE)
        prompt = prompt_template.format(
            query=query,
            history=self._format_history(),
            data_context=self.rag_retriever.get_all_available_data_context(),
            tool_docstrings=self.tool_executor.get_tool_docstrings()
        )
        ai_message = self.llm.invoke(prompt)
        response_content = ai_message.content
        return self._parse_llm_response(response_content)

    def run(self, query: str) -> Dict[str, Any]:
        """
        Runs the main agent loop, now consistently returning a dictionary
        containing the summary, the generated layers, and the full history.
        """
        try:
            available_files = self.rag_retriever.get_initial_file_map()
            self.tool_executor.register_available_files(available_files)
        except Exception as e:
            error_message = f"Failed to prepare the agent's data environment. Error: {e}"
            self._publish_ws("error", {"message": error_message})
            return {"summary": error_message, "layers": [], "full_history": self.history}

        for loop_count in range(self.max_loops):
            self._publish_ws("status_update", {"message": f"Agent is reasoning... (Step {loop_count + 1}/{self.max_loops})"})
            action_plan = self._get_next_thought_and_action(query)

            thought = action_plan.get("thought", {})
            action = action_plan.get("action", {})
            self._publish_ws("chain_of_thought", {"thought": thought})
            time.sleep(self.ui_delay)

            self._publish_ws("action", {"action": action})
            tool_name = action.get("tool")

            if not tool_name or tool_name.lower() == "finish":
                final_answer = action.get("args", {}).get("answer", "Analysis complete.")
                final_layers = self.tool_executor.get_generated_results()
                self._publish_ws("job_complete", {"message": final_answer, "results": {"layers": final_layers}})
                logger.info(f"Job {self.job_id} completed successfully.")
                return {"summary": final_answer, "layers": final_layers, "full_history": self.history}

            self._publish_ws("status_update", {"message": f"Executing tool: {tool_name}..."})
            observation = ""
            try:
                # All tools are now handled uniformly by the executor.
                observation = self.tool_executor.execute_tool(
                    tool_name=tool_name,
                    args=action.get("args", {})
                )
            except Exception as e:
                observation = f"Error during tool execution: {str(e)}"

            self._publish_ws("observation", {"observation": observation})
            self.history.append({"thought": thought, "action": action, "observation": observation})
            time.sleep(self.ui_delay)

        # Handle exiting due to max loops
        logger.warning(f"Job {self.job_id} reached maximum steps. Forcing completion.")
        final_layers = self.tool_executor.get_generated_results()
        final_summary = "Maximum analysis steps reached."
        if self.history:
            last_recommendation = self.history[-1].get("thought", {}).get("recommendation", "No final recommendation was formed.")
            final_summary += f" The agent's last intended step was: '{last_recommendation}'"
        
        self._publish_ws("job_complete", {"message": final_summary, "results": {"layers": final_layers}})

        return {"summary": final_summary, "layers": final_layers, "full_history": self.history}