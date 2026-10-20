"""Serves the annotated video as a live MJPEG stream for a browser or the dashboard.

  http://127.0.0.1:8090/          viewer page
  http://127.0.0.1:8090/stream    the live stream (use as <img src=...>)
"""
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import cv2

PAGE = b"""<!doctype html><meta charset="utf-8"><title>DemaFur live</title>
<body style="margin:0;background:#000;display:grid;place-items:center;height:100vh">
<img src="/stream" style="max-width:100%;max-height:100vh"></body>"""


class LiveStream:
    def __init__(self, port=8090):
        self.jpeg = None
        self.lock = threading.Lock()
        stream = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass                                    # keep the terminal quiet

            def do_GET(self):
                if self.path == '/':
                    self.send_response(200)
                    self.send_header('Content-Type', 'text/html')
                    self.end_headers()
                    self.wfile.write(PAGE)
                elif self.path == '/stream':
                    self.send_response(200)
                    self.send_header('Content-Type', 'multipart/x-mixed-replace; boundary=frame')
                    self.send_header('Access-Control-Allow-Origin', '*')   # let the dashboard embed it
                    self.end_headers()
                    try:
                        while True:
                            with stream.lock:
                                jpeg = stream.jpeg
                            if jpeg:
                                self.wfile.write(b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + jpeg + b'\r\n')
                            time.sleep(1 / 15)          # about 15 pictures per second
                    except (BrokenPipeError, ConnectionResetError):
                        pass                            # the viewer closed the page
                else:
                    self.send_error(404)

        self.server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        print(f'Live view: http://127.0.0.1:{port}/')

    def publish(self, frame):
        """Call once per frame with the annotated picture."""
        ok, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        if ok:
            with self.lock:
                self.jpeg = buffer.tobytes()