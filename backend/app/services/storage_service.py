"""Private file storage. Files live outside any web root; clients only ever receive
an opaque key and fetch the bytes through an authorised API route."""
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile

from app.core import clock
from app.core.config import get_config

_IMAGE_MAGIC = [
    (b"\xff\xd8\xff", "jpg"),
    (b"\x89PNG\r\n\x1a\n", "png"),
]


def _sniff(data: bytes) -> str | None:
    for magic, ext in _IMAGE_MAGIC:
        if data.startswith(magic):
            return ext
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    if data.startswith(b"%PDF-"):
        return "pdf"
    return None


MEDIA_TYPES = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp", "pdf": "application/pdf"}


def _root() -> Path:
    root = Path(get_config().private_storage_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def read_validated(upload: UploadFile, allowed: set[str]) -> tuple[bytes, str]:
    """Reads at most max_upload_bytes+1, validates content by magic bytes (the client's
    filename and content-type are ignored). Returns (bytes, extension)."""
    limit = get_config().max_upload_bytes
    data = upload.file.read(limit + 1)
    if not data:
        raise HTTPException(422, "Uploaded file is empty")
    if len(data) > limit:
        raise HTTPException(413, f"File too large (max {limit // (1024 * 1024)} MB)")
    ext = _sniff(data)
    if ext is None or ext not in allowed:
        raise HTTPException(422, "Unsupported file type")
    return data, ext


def save_bytes(kind: str, data: bytes, ext: str) -> str:
    """Stores under <root>/<kind>/<yyyy>/<mm>/<uuid>.<ext>; returns the relative key."""
    now = clock.now_utc()
    key = f"{kind}/{now:%Y}/{now:%m}/{uuid.uuid4().hex}.{ext}"
    path = _root() / key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return key


def resolve(key: str) -> Path:
    root = _root()
    path = (root / key).resolve()
    if root not in path.parents or not path.is_file():  # blocks traversal
        raise HTTPException(404, "File not found")
    return path


def delete_quietly(key: str | None) -> None:
    if not key:
        return
    try:
        path = (_root() / key).resolve()
        if _root() in path.parents:
            path.unlink(missing_ok=True)
    except OSError:
        pass


def media_type_for(key: str) -> str:
    return MEDIA_TYPES.get(key.rsplit(".", 1)[-1].lower(), "application/octet-stream")
