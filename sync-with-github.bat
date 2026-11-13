@echo off
setlocal
cd /d "%~dp0"
echo ============================================
echo  Get Vaulted - sync this folder with GitHub
echo ============================================
echo.

echo Checking for unsaved local changes...
git status --porcelain --untracked-files=no > "%TEMP%\gv_status.txt"
for %%A in ("%TEMP%\gv_status.txt") do if %%~zA GTR 0 (
  echo.
  echo STOPPED: this folder has local changes that would be affected:
  type "%TEMP%\gv_status.txt"
  echo.
  echo Nothing was changed. Send this list to Claude.
  del "%TEMP%\gv_status.txt"
  pause
  exit /b 1
)
del "%TEMP%\gv_status.txt"

echo.
echo [1/5] Downloading latest from GitHub...
git fetch origin || goto :fail

echo.
echo [2/5] Switching to the get-vaulted-beta branch...
git checkout get-vaulted-beta || goto :fail
git pull --ff-only origin get-vaulted-beta || goto :fail

echo.
echo [3/5] Installing packages (main folder)...
call npm install || goto :fail

echo.
echo [4/5] Installing packages (web)...
pushd web
call npm install || (popd & goto :fail)
popd

echo.
echo [5/5] Installing packages (mobile)...
pushd mobile
call npm install || (popd & goto :fail)
popd

echo.
echo ============================================
echo  DONE. This folder now matches GitHub:
git log -1 --format="  %%h  %%s"
echo ============================================
echo.
pause
(goto) 2>nul & del "%~f0"

:fail
echo.
echo ============================================
echo  Something went wrong above. Nothing else was run.
echo  Take a screenshot of this window and send it to Claude.
echo ============================================
pause
exit /b 1
