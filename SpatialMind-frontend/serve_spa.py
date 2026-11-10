import http.server
import socketserver
import time
from pathlib import Path

PORT = 5173
DIST_DIR = Path(__file__).resolve().parent / "dist"

class SPAServer(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST_DIR), **kwargs)

    def do_GET(self):
        clean_path = self.path.split("?")[0].lstrip("/")
        local_target = DIST_DIR / clean_path
        if not local_target.exists() and not self.path.startswith("/api"):
            self.path = "/index.html"
        return super().do_GET()

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    while True:
        try:
            with socketserver.TCPServer(("0.0.0.0", PORT), SPAServer) as httpd:
                print(f"Serving SpatialMind Frontend on http://localhost:{PORT}")
                httpd.serve_forever()
        except KeyboardInterrupt:
            time.sleep(0.5)
            continue
        except Exception as e:
            print(f"Server exception: {e}, restarting in 1s...")
            time.sleep(1.0)
