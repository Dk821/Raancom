import re
import secrets
import string
import uuid
from datetime import datetime, timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.core import clock
from app.core.config import get_config

_hasher = PasswordHasher()  # Argon2id with library defaults
# Pre-computed hash used to equalise timing when the account does not exist.
_DUMMY_HASH = _hasher.hash("not-a-real-password")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerificationError, InvalidHashError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


def validate_password_strength(password: str) -> None:
    """Raises ValueError with a user-facing message."""
    if len(password) < 10:
        raise ValueError("Password must be at least 10 characters long")
    if len(password) > 128:
        raise ValueError("Password must be at most 128 characters long")
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        raise ValueError("Password must contain at least one letter and one number")


def generate_temp_password() -> str:
    alphabet = string.ascii_letters + string.digits
    while True:
        pw = "".join(secrets.choice(alphabet) for _ in range(12))
        try:
            validate_password_strength(pw)
            return pw
        except ValueError:
            continue


def new_session_id() -> str:
    return str(uuid.uuid4())


def create_access_token(user_id: int, session_id: str, expires_at: datetime) -> str:
    cfg = get_config()
    payload = {"sub": str(user_id), "sid": session_id, "exp": expires_at}
    return jwt.encode(payload, cfg.secret_key, algorithm=cfg.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any] | None:
    cfg = get_config()
    try:
        return jwt.decode(token, cfg.secret_key, algorithms=[cfg.jwt_algorithm])
    except jwt.PyJWTError:
        return None


def session_expiry() -> datetime:
    return clock.now_utc() + timedelta(minutes=get_config().access_token_minutes)
