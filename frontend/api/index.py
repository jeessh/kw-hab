"""Vercel Python serverless entry point.

Mounts the FastAPI backend under /api so the whole app is served from one
origin (the Next.js frontend), keeping the SameSite=Lax auth cookie same-site.
Vercel's Python runtime serves the module-level `app` ASGI callable directly.
"""

import os
import sys

# Ensure the bundled backend package (api/app) is importable regardless of the
# runtime's working directory.
sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI

from app.main import app as backend_app

app = FastAPI()
app.mount("/api", backend_app)
