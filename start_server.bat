@echo off
echo 🚀 正在启动澳门空气质量监测系统...
echo.

cd /d "%~dp0\server"
call conda activate base
python app.py

pause