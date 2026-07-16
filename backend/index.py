"""Vercel entrypoint for the backend service (see vercel.json `services`).

`entrypoint: "index:app"` loads this ASGI app. A Vercel service receives the
original request path, so /api/events arrives here as /api/events; the app's
routers are prefix-agnostic (they're /events, /auth/... to match local dev),
so strip the /api prefix here. root_path="/api" then only fixes docs URLs.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.main import app as fastapi_app  # noqa: E402

_PREFIX = "/api"


class _StripApiPrefix:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope.get("path", "").startswith(_PREFIX):
            scope = dict(scope)
            scope["path"] = scope["path"][len(_PREFIX):] or "/"
            raw = scope.get("raw_path")
            if isinstance(raw, bytes) and raw.startswith(_PREFIX.encode()):
                scope["raw_path"] = raw[len(_PREFIX):] or b"/"
        await self.app(scope, receive, send)


app = _StripApiPrefix(fastapi_app)
