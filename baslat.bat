@echo off
setlocal

cd /d "%~dp0"

set PNPM_CMD=pnpm
where pnpm >nul 2>nul
if not %errorlevel%==0 set PNPM_CMD=%USERPROFILE%\.npm-global\pnpm.cmd

echo AQUAI baslatiliyor...
echo   API : http://localhost:3001
echo   Web : http://localhost:3000
echo.
echo Not: API ve Web ayri pencerelerde acilir (ayni konsolda calistirinca
echo Windows'ta biri diger dev sunucusunu Ctrl+Break ile kapatabiliyor).
echo.

start "AQUAI API (3001)" cmd /k "cd /d "%~dp0" && "%PNPM_CMD%" --filter @aquai/api run dev"
start "AQUAI Web (3000)" cmd /k "cd /d "%~dp0" && "%PNPM_CMD%" --filter @aquai/web run dev"

endlocal
