from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks

from ..config import settings
from ..schemas import RefreshResult

router = APIRouter(prefix="/api", tags=["conditions"])


@router.post("/refresh", response_model=RefreshResult)
def refresh(background: BackgroundTasks, wait: bool = False):
    """重新抓取所有潛點的海況並重算燈號 / 建議。

    預設在背景執行（立即回應）；`?wait=true` 會等跑完再回應（本地測試方便）。
    """

    from ..refresh import run

    if wait:
        result = run()
        return RefreshResult(**result, llm=settings.use_llm)

    background.add_task(run)
    return RefreshResult(updated_locations=0, days=4, source="openmeteo (背景執行中)", llm=settings.use_llm)
