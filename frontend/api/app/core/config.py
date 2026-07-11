from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str
    JWT_SECRET: str  # no default — pydantic raises at startup if unset
    JWT_ALG: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 1 week

    COOKIE_NAME: str = "kwcc_session"
    COOKIE_SECURE: bool = False

    FRONTEND_ORIGIN: str = "http://localhost:3000"


settings = Settings()
