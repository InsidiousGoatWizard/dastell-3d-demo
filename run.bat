@echo off
cd "C:\Users\FLAT CAT\Desktop\dastell-game"
python -m http.server 8001 | start "http://localhost:8001"
pause