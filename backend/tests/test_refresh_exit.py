"""排程的結束碼：任何地點沒更新到就要非零結束（PROBLEM_LOG 2026-10-24）。"""

import pytest

from app import refresh


def _result(updated, total, failed=(), tide_failed=()):
    return {
        "updated_locations": updated,
        "total_locations": total,
        "failed": [{"location": n, "error": "x"} for n in failed],
        "tide_failed": len(tide_failed),
        "tide_failed_locations": list(tide_failed),
    }


@pytest.mark.parametrize(
    ("result", "code", "annotation"),
    [
        (_result(13, 13), 0, None),
        (_result(13, 13, tide_failed=["基隆市"]), 0, "::warning::1 個地點的潮汐抓取失敗：基隆市"),
        (_result(12, 13, failed=["蘭嶼"]), 1, "::error::部分地點海況沒更新到（12/13）：蘭嶼"),
        (_result(0, 13), 1, "::error::海況更新全數失敗"),
    ],
)
def test_main_exit_code(monkeypatch, capsys, result, code, annotation):
    monkeypatch.setattr(refresh, "run", lambda: result)
    assert refresh.main() == code
    out = capsys.readouterr().out
    if annotation:
        assert annotation in out
    else:
        assert "::" not in out
