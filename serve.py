"""Telaah AI: server lokal sederhana.

Sama seperti `python -m http.server`, tetapi mengirim header `Cache-Control: no-cache`
agar browser selalu memeriksa versi terbaru index.html dan aset aplikasi (tidak
menampilkan versi lama setelah aplikasi diperbarui). Model ONNX tetap boleh di-cache
karena ukurannya besar dan jarang berubah.

Pemakaian:  python serve.py [port]      (bawaan 5510)
"""
import http.server
import socketserver
import sys
from functools import partial
from pathlib import Path

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5510
ROOT = Path(__file__).resolve().parent


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.js': 'application/javascript', '.mjs': 'application/javascript',
                      '.json': 'application/json', '.onnx': 'application/octet-stream', '.wasm': 'application/wasm'}

    def end_headers(self):
        if '/models/' in self.path and self.path.endswith('.onnx'):
            self.send_header('Cache-Control', 'public, max-age=604800')
        else:
            self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, fmt, *args):  # log ringkas
        sys.stderr.write('  %s\n' % (fmt % args))


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == '__main__':
    with Server(('', PORT), partial(Handler, directory=str(ROOT))) as httpd:
        print(f'Telaah AI berjalan di http://localhost:{PORT}  (Ctrl+C untuk berhenti)', flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
