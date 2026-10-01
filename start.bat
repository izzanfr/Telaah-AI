@echo off
REM Telaah AI: jalankan server lokal lalu buka browser.
REM Model AI (IndoRoBERTa) hanya dapat dimuat lewat http://, bukan file://.
cd /d "%~dp0"
set PORT=5510
echo.
echo   Telaah AI berjalan di http://localhost:%PORT%
echo   Tutup jendela ini untuk menghentikan server.
echo.
start "" "http://localhost:%PORT%/"
python serve.py %PORT% 2>nul || py -3 serve.py %PORT%
