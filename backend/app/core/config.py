from functools import lru_cache
from typing import List, Union

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Raancom HRMS"
    environment: str = "development"  # development | production

    # MySQL 8 example:
    # mysql+pymysql://raancom_app:PASSWORD@127.0.0.1:3306/raancom?charset=utf8mb4
    database_url: str
    secret_key: str  # >= 32 random chars; never commit

    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 480

    login_max_attempts: int = 5
    login_lockout_minutes: int = 15
    ip_rate_limit_attempts: int = 30
    ip_rate_limit_window_seconds: int = 900
    trust_proxy_headers: bool = False  # set True behind Nginx

    private_storage_dir: str = "./storage/private"  # must be outside any public web root
    max_upload_bytes: int = 5 * 1024 * 1024

    cors_origins: Union[List[str], str] = ["http://localhost:5173"]
    docs_enabled: bool = True

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, v):
        if isinstance(v, str):
            s = v.strip()
            if s.startswith("["):
                import json
                return json.loads(s)
            return [o.strip() for o in s.split(",") if o.strip()]
        return v

    @field_validator("secret_key")
    @classmethod
    def _secret_len(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters")
        return v

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"


@lru_cache
def get_config() -> Settings:
    return Settings()  # type: ignore[call-arg]
