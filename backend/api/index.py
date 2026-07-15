"""Vercel entrypoint: exposes the FastAPI app as an ASGI function.

Vercel routes /api/* here with the prefix intact, so strip it before routing —
FastAPI's root_path only fixes docs/OpenAPI URLs, it does not strip paths.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

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
