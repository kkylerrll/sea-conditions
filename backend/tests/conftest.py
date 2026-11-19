"""測試一律用暫存 SQLite，不碰 .env 裡可能設定的正式資料庫，也不呼叫 LLM。

環境變數必須在 import app.* 之前設好（app.config 在 import 時就讀設定、app.db 就建 engine），
所以放在 conftest 的最上層。
"""

import os
import tempfile
from pathlib import Path

_tmpdir = tempfile.mkdtemp(prefix="sea-conditions-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_tmpdir) / 'test.db'}"
os.environ["USE_LLM"] = "false"
os.environ["ANTHROPIC_API_KEY"] = ""
