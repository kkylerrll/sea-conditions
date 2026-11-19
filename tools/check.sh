#!/bin/bash
# 改完程式後跑這支：跟 CI 檢查一樣的東西，但只印出失敗的部分（省 token）。
# 用法：tools/check.sh            前端型別檢查 + 後端 import 冒煙
#       tools/check.sh --front    只跑前端
#       tools/check.sh --back     只跑後端
#       tools/check.sh --build    另外跑 pnpm build（跟 CI 一樣；前端 dev server 開著時會拒絕跑）
# 全部通過時每一項只印一行；失敗時印出該項最後 40 行，並且 exit 1。
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONT=1; BACK=1; BUILD=0
for a in "$@"; do
  case $a in
    --front) BACK=0 ;;
    --back) FRONT=0 ;;
    --build) BUILD=1 ;;
    *) echo "不認得的參數：$a"; exit 2 ;;
  esac
done

LOG="$(mktemp -t sea-check)"
FAIL=0
step() {  # step <名稱> <目錄> <指令...>
  local name=$1 dir=$2; shift 2
  local t0=$SECONDS
  if (cd "$dir" && CI=true "$@" </dev/null) >"$LOG" 2>&1; then
    echo "✓ $name ($((SECONDS - t0))s)"
  else
    echo "✗ $name ($((SECONDS - t0))s)，最後 40 行："
    tail -40 "$LOG" | sed 's/^/    /'
    FAIL=1
  fi
}

if [ $FRONT = 1 ]; then
  step "前端 型別檢查 (tsc)" "$ROOT/frontend" pnpm exec tsc --noEmit --pretty false
  if [ $BUILD = 1 ]; then
    # 規則：dev server 開著時不要在同一個目錄跑 production build（會弄壞 .next/）
    dev_pid=""
    for p in $(pgrep -f "next dev" 2>/dev/null); do
      cwd=$(lsof -a -p "$p" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')
      case $cwd in "$ROOT/frontend"*) dev_pid=$p ;; esac
    done
    if [ -n "$dev_pid" ]; then
      echo "✗ 前端 build：略過，frontend 的 dev server 還開著（pid ${dev_pid}）。先停掉再跑 --build。"
      FAIL=1
    else
      step "前端 build" "$ROOT/frontend" pnpm build
    fi
  fi
fi

if [ $BACK = 1 ]; then
  PY="$ROOT/backend/.venv/bin/python"
  [ -x "$PY" ] || PY=python3
  # 本機是 3.9：compileall 會抓到 3.10+ 才有的語法；import 會抓到執行期才算的型別註解
  step "後端 語法 (compileall)" "$ROOT/backend" "$PY" -m compileall -q app
  step "後端 import app.main" "$ROOT/backend" "$PY" -c "from app.main import app"
fi

rm -f "$LOG"
exit $FAIL
