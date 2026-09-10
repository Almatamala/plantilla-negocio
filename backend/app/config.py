from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://store:store@localhost:5432/store"
    api_admin_token: str = "change-me-in-development"
    cors_origins: str = "http://localhost:3000"
    # Login con Google (OAuth2). GOOGLE_REDIRECT_URI apunta al route handler
    # de Next.js (p. ej. http://localhost:3000/api/auth/google/callback).
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = ""
    # Correos separados por coma que reciben rol admin al iniciar sesión.
    admin_emails: str = "alvaro.dario09@gmail.com"
    # Secreto compartido con Next.js para firmar/verificar la sesión (JWT).
    auth_jwt_secret: str = "change-me-in-development"
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    @property
    def admin_email_list(self) -> list[str]:
        return [item.strip().lower() for item in self.admin_emails.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
