# Local Forum

A local-first forum. Posts, replies, and uploaded pictures are stored in `forum.db` on the computer running the server, while the forum is visible to anyone who can reach that computer on the network.

## Run

```bash
python3 server.py
```

Open:

```text
http://127.0.0.1:4173
```

Network access uses this computer's local IP address with port `4173`:

```text
http://192.168.1.25:4173
```

## Data

The database file is created automatically as `forum.db` in this folder. Deleting that file removes all posts, replies, and pictures.

## Notes

This version has no login system or moderation queue. Anyone who can access the server can post.
