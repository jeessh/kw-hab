"""Supabase Storage upload helper.

Uploads bytes to a public bucket using the SECRET key (server-side only) and
returns the public URL. Kept dependency-light — talks to the Storage REST API
directly with httpx rather than pulling in the full supabase client.
"""

import uuid

import httpx

from app.core.config import settings

# Map a MIME type to a file extension for the stored object's name.
_EXT = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
}


class StorageError(RuntimeError):
    """Raised when the upload cannot be performed or the bucket rejects it."""


async def upload_image(data: bytes, content_type: str) -> str:
    """Upload image bytes to the configured bucket; return the public URL.

    Async so the (up to 30s) storage round trip never blocks the event loop.
    Raises StorageError if storage isn't configured or the upload fails.
    """
    if not settings.SUPABASE_URL or not settings.SUPABASE_SECRET_KEY:
        raise StorageError("Image storage is not configured on the server.")

    ext = _EXT.get(content_type)
    if ext is None:
        raise StorageError(f"Unsupported image type: {content_type}")

    bucket = settings.SUPABASE_IMAGE_BUCKET
    key = f"{uuid.uuid4()}.{ext}"
    base = settings.SUPABASE_URL.rstrip("/")
    upload_url = f"{base}/storage/v1/object/{bucket}/{key}"

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.post(
                upload_url,
                content=data,
                headers={
                    "Authorization": f"Bearer {settings.SUPABASE_SECRET_KEY}",
                    "apikey": settings.SUPABASE_SECRET_KEY,
                    "Content-Type": content_type,
                    "cache-control": "3600",
                },
            )
    except httpx.HTTPError as exc:
        raise StorageError(f"Could not reach image storage: {exc}") from exc

    if res.status_code >= 400:
        raise StorageError(f"Storage rejected the upload ({res.status_code}): {res.text}")

    # Public bucket → the object is served at this stable URL.
    return f"{base}/storage/v1/object/public/{bucket}/{key}"
