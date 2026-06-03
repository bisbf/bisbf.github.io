from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
import json
import re
import socket
import sqlite3
import subprocess
import time


ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "forum.db"
HOST = "0.0.0.0"
PORT = 4173
MAX_JSON_BYTES = 4_500_000
MAX_IMAGE_CHARS = 2_800_000

CATEGORIES = {
    "general",
    "questions",
    "clubs",
    "pictures",
}


def now_ms():
    return int(time.time() * 1000)


def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    with connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                body TEXT NOT NULL,
                author TEXT NOT NULL,
                category TEXT NOT NULL,
                image_data TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS comments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                post_id INTEGER NOT NULL,
                body TEXT NOT NULL,
                author TEXT NOT NULL,
                image_data TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
            );
            """
        )
        ensure_column(conn, "posts", "image_data", "TEXT NOT NULL DEFAULT ''")
        ensure_column(conn, "comments", "image_data", "TEXT NOT NULL DEFAULT ''")
        conn.execute(
            """
            UPDATE posts
            SET category = 'general'
            WHERE category NOT IN ('general', 'questions', 'clubs', 'pictures')
            """
        )


def ensure_column(conn, table, column, definition):
    columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
    if column not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def local_ip_candidates():
    candidates = []
    for interface in ("en0", "en1"):
        try:
            value = subprocess.check_output(
                ["ipconfig", "getifaddr", interface],
                stderr=subprocess.DEVNULL,
                text=True,
                timeout=1,
            ).strip()
            if value:
                candidates.append(value)
        except (OSError, subprocess.SubprocessError):
            pass

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            candidates.append(sock.getsockname()[0])
    except OSError:
        pass

    unique = []
    for candidate in candidates:
        if candidate and candidate not in unique:
            unique.append(candidate)
    return unique or ["YOUR_LOCAL_IP"]


def create_server():
    for port in range(PORT, PORT + 10):
        try:
            return port, ThreadingHTTPServer((HOST, port), ForumHandler)
        except OSError:
            continue
    raise OSError(f"No open port found from {PORT} to {PORT + 9}")


def row_to_post(row):
    return {
        "id": row["id"],
        "title": row["title"],
        "body": row["body"],
        "author": row["author"],
        "category": row["category"],
        "imageData": row["image_data"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "commentCount": row["comment_count"],
    }


def row_to_comment(row):
    return {
        "id": row["id"],
        "postId": row["post_id"],
        "body": row["body"],
        "author": row["author"],
        "imageData": row["image_data"],
        "createdAt": row["created_at"],
    }


def clean_text(value, max_len):
    if not isinstance(value, str):
        return ""
    value = re.sub(r"\s+", " ", value.strip())
    return value[:max_len]


def clean_body(value, max_len):
    if not isinstance(value, str):
        return ""
    value = value.replace("\r\n", "\n").replace("\r", "\n").strip()
    value = re.sub(r"\n{4,}", "\n\n\n", value)
    return value[:max_len]


def clean_image(value):
    if not isinstance(value, str) or not value:
        return ""
    if len(value) > MAX_IMAGE_CHARS:
        return ""
    if not re.fullmatch(r"data:image/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+", value):
        return ""
    return value


class ForumHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        print(f"{self.client_address[0]} - {fmt % args}")

    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > MAX_JSON_BYTES:
                return None
            raw = self.rfile.read(length)
            return json.loads(raw.decode("utf-8") or "{}")
        except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
            return None

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            return self.send_json(
                200,
                {
                    "ok": True,
                    "storage": str(DB_PATH),
                    "categories": sorted(CATEGORIES),
                },
            )
        if parsed.path == "/api/posts":
            return self.list_posts(parsed.query)
        match = re.fullmatch(r"/api/posts/(\d+)", parsed.path)
        if match:
            return self.get_post(int(match.group(1)))
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/posts":
            return self.create_post()
        match = re.fullmatch(r"/api/posts/(\d+)/comments", parsed.path)
        if match:
            return self.create_comment(int(match.group(1)))
        return self.send_json(404, {"error": "Not found"})

    def list_posts(self, query):
        params = parse_qs(query)
        category = clean_text(params.get("category", [""])[0], 64)
        search = clean_text(params.get("q", [""])[0], 120)

        where = []
        values = []
        if category and category != "all":
            where.append("p.category = ?")
            values.append(category)
        if search:
            where.append("(p.title LIKE ? OR p.body LIKE ? OR p.author LIKE ?)")
            needle = f"%{search}%"
            values.extend([needle, needle, needle])

        where_sql = f"WHERE {' AND '.join(where)}" if where else ""
        with connect() as conn:
            rows = conn.execute(
                f"""
                SELECT p.*, COUNT(c.id) AS comment_count
                FROM posts p
                LEFT JOIN comments c ON c.post_id = p.id
                {where_sql}
                GROUP BY p.id
                ORDER BY p.updated_at DESC, p.created_at DESC
                LIMIT 100
                """,
                values,
            ).fetchall()
        self.send_json(200, {"posts": [row_to_post(row) for row in rows]})

    def get_post(self, post_id):
        with connect() as conn:
            post = conn.execute(
                """
                SELECT p.*, COUNT(c.id) AS comment_count
                FROM posts p
                LEFT JOIN comments c ON c.post_id = p.id
                WHERE p.id = ?
                GROUP BY p.id
                """,
                (post_id,),
            ).fetchone()
            if not post:
                return self.send_json(404, {"error": "Post not found"})
            comments = conn.execute(
                """
                SELECT *
                FROM comments
                WHERE post_id = ?
                ORDER BY created_at ASC
                """,
                (post_id,),
            ).fetchall()
        self.send_json(
            200,
            {
                "post": row_to_post(post),
                "comments": [row_to_comment(row) for row in comments],
            },
        )

    def create_post(self):
        data = self.read_json()
        if data is None:
            return self.send_json(400, {"error": "Invalid JSON"})

        title = clean_text(data.get("title"), 120)
        author = clean_text(data.get("author"), 60) or "Anonymous"
        category = clean_text(data.get("category"), 64) or "general"
        body = clean_body(data.get("body"), 5000)
        image_data = clean_image(data.get("imageData"))

        if category not in CATEGORIES:
            category = "general"
        if len(title) < 3:
            return self.send_json(400, {"error": "Title must be at least 3 characters"})
        if len(body) < 3 and not image_data:
            return self.send_json(400, {"error": "Post must include text or a picture"})
        if data.get("imageData") and not image_data:
            return self.send_json(400, {"error": "Picture must be PNG, JPEG, WebP, or GIF under about 2 MB"})

        created_at = now_ms()
        with connect() as conn:
            cursor = conn.execute(
                """
                INSERT INTO posts (title, body, author, category, image_data, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (title, body, author, category, image_data, created_at, created_at),
            )
            post_id = cursor.lastrowid

        self.get_post(post_id)

    def create_comment(self, post_id):
        data = self.read_json()
        if data is None:
            return self.send_json(400, {"error": "Invalid JSON"})

        author = clean_text(data.get("author"), 60) or "Anonymous"
        body = clean_body(data.get("body"), 2000)
        image_data = clean_image(data.get("imageData"))
        if len(body) < 2 and not image_data:
            return self.send_json(400, {"error": "Reply must include text or a picture"})
        if data.get("imageData") and not image_data:
            return self.send_json(400, {"error": "Picture must be PNG, JPEG, WebP, or GIF under about 2 MB"})

        created_at = now_ms()
        with connect() as conn:
            exists = conn.execute("SELECT id FROM posts WHERE id = ?", (post_id,)).fetchone()
            if not exists:
                return self.send_json(404, {"error": "Post not found"})
            conn.execute(
                """
                INSERT INTO comments (post_id, body, author, image_data, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (post_id, body, author, image_data, created_at),
            )
            conn.execute(
                "UPDATE posts SET updated_at = ? WHERE id = ?",
                (created_at, post_id),
            )

        self.get_post(post_id)


if __name__ == "__main__":
    init_db()
    port, server = create_server()
    print(f"Local Forum running at http://127.0.0.1:{port}", flush=True)
    for ip in local_ip_candidates():
        print(f"Network URL: http://{ip}:{port}", flush=True)
    print(f"Posts are stored locally in {DB_PATH}", flush=True)
    server.serve_forever()
