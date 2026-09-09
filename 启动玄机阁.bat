@echo off
rem 玄机阁 一键启动脚本（Windows）
rem 首次使用请先：python -m venv .venv && .venv\Scripts\pip install -r requirements.txt

cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo [提示] 未找到虚拟环境，正在创建并安装依赖...
    python -m venv .venv
    .venv\Scripts\pip install -r requirements.txt
)

echo 正在启动玄机阁，请稍候...
echo 启动后浏览器访问 http://127.0.0.1:8787
.venv\Scripts\python.exe -m uvicorn server:app --host 127.0.0.1 --port 8787
