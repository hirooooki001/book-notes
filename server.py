#!/usr/bin/env python3
"""かみくだき読書ノート 用のローカルサーバー。

・サイトをブラウザで表示する
・「書く」画面から保存された記事を books.js に書き込む

自分のPC（127.0.0.1）からしか接続できません。追加ライブラリは不要です。
"""
import datetime
import http.server
import subprocess
import json
import os
import re
import sys
import tempfile
import threading
import webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
BOOKS_JS = os.path.join(ROOT, "books.js")
PORT = int(os.environ.get("PORT", "8765"))
ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,80}$")
FIELDS = ["id", "sample", "title", "author", "readDate", "category", "tags", "oneLine", "why",
          "points", "easy", "example", "opinion", "action", "quote", "understanding"]
LOCK = threading.Lock()


def load_books():
    text = open(BOOKS_JS, encoding="utf-8").read()
    start, end = text.index("["), text.rindex("]")
    return json.loads(text[start:end + 1])


def save_books(books):
    body = json.dumps(books, ensure_ascii=False, indent=2)
    out = ("// このファイルは「書く」画面から自動で更新されます。\n"
           "window.BOOKS = " + body + ";\n")
    fd, tmp = tempfile.mkstemp(dir=ROOT, suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(out)
    os.replace(tmp, BOOKS_JS)


def clean(book):
    b = {k: book.get(k) for k in FIELDS if k in book}
    if not isinstance(b.get("id"), str) or not ID_RE.match(b["id"]):
        raise ValueError("記事IDが不正です")
    if not str(b.get("title", "")).strip():
        raise ValueError("タイトルは必須です")
    if not isinstance(b.get("tags"), list):
        b["tags"] = []
    if not isinstance(b.get("points"), list):
        b["points"] = []
    try:
        b["understanding"] = max(1, min(5, int(b.get("understanding") or 3)))
    except (TypeError, ValueError):
        b["understanding"] = 3
    if not b.get("sample"):
        b.pop("sample", None)
    return b


def git(*args):
    r = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, timeout=60)
    return r.returncode, (r.stdout + r.stderr).strip()


def publish():
    """books.js の変更を GitHub に push して公開する。"""
    if not os.path.isdir(os.path.join(ROOT, ".git")):
        return 400, {"ok": False, "error": "GitHub の設定がまだありません"}
    git("add", "books.js")
    code, _ = git("diff", "--cached", "--quiet")
    if code != 0:
        stamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
        code, out = git("commit", "-m", "記事を更新 (%s)" % stamp)
        if code != 0:
            return 500, {"ok": False, "error": "コミットに失敗しました: " + out[-300:]}
    code, out = git("push", "-q", "origin", "HEAD")
    if code != 0:
        return 500, {"ok": False, "error": "GitHub への送信に失敗しました: " + out[-300:]}
    url = ""
    c, remote = git("remote", "get-url", "origin")
    m = re.search(r"github\.com[:/]([^/]+)/([^/.]+)", remote) if c == 0 else None
    if m:
        url = "https://%s.github.io/%s/" % (m.group(1).lower(), m.group(2))
    return 200, {"ok": True, "url": url}


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, code, obj):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.split("?")[0].endswith("/api/ping"):
            return self._json(200, {"ok": True})
        return super().do_GET()

    def do_POST(self):
        # 他のサイトからの書き込みを防ぐ
        origin = self.headers.get("Origin")
        if origin and not re.match(r"^http://(localhost|127\.0\.0\.1):%d$" % PORT, origin):
            return self._json(403, {"ok": False, "error": "forbidden"})
        if "application/json" not in (self.headers.get("Content-Type") or ""):
            return self._json(415, {"ok": False, "error": "JSON only"})
        try:
            length = int(self.headers.get("Content-Length") or 0)
            payload = json.loads(self.rfile.read(min(length, 2_000_000)).decode("utf-8"))
            path = self.path.split("?")[0]
            with LOCK:
                books = load_books()
                if path.endswith("/api/save"):
                    b = clean(payload)
                    for i, x in enumerate(books):
                        if x.get("id") == b["id"]:
                            if x.get("sample"):
                                b["sample"] = True
                            books[i] = b
                            break
                    else:
                        books.insert(0, b)
                elif path.endswith("/api/publish"):
                    return self._json(*publish())
                elif path.endswith("/api/delete"):
                    books = [x for x in books if x.get("id") != payload.get("id")]
                else:
                    return self._json(404, {"ok": False, "error": "not found"})
                save_books(books)
            return self._json(200, {"ok": True, "books": books})
        except ValueError as e:
            return self._json(400, {"ok": False, "error": str(e)})
        except Exception as e:  # noqa
            return self._json(500, {"ok": False, "error": "保存に失敗しました: %s" % e})

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            sys.stderr.write("%s\n" % (fmt % args))


def main():
    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    url = "http://localhost:%d/write.html" % PORT
    print("かみくだき読書ノート を起動しました")
    print("  書く画面: " + url)
    print("  サイト  : http://localhost:%d/" % PORT)
    print("終了するには このウィンドウで Ctrl + C を押すか、ウィンドウを閉じてください。")
    if "--no-browser" not in sys.argv:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
