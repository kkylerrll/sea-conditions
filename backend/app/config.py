from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    # 不設就用專案目錄下的 SQLite 檔，零設定即可跑
    database_url: str = "sqlite:///./sea_conditions.db"

    # 中央氣象署開放資料 https://opendata.cwa.gov.tw
    cwa_api_key: str = ""

    # 有金鑰（或本機已 `ant auth login`）+ use_llm 才會呼叫 LLM
    anthropic_api_key: str = ""
    use_llm: bool = False
    llm_model: str = "claude-opus-5"

    cors_origins: str = "http://localhost:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
