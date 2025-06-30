from langchain_community.tools import DuckDuckGoSearchRun

class GoogleSearchTool:
    def __init__(self):
        self.search = DuckDuckGoSearchRun()

    def search_query(self, query: str) -> str:
        return self.search.run(query)