@echo off
chcp 65001 >nul
setlocal
set "DEST=%APPDATA%\Adobe\CEP\extensions\ru.splat.penpot2ai"
echo Installing panel to: %DEST%
for %%v in (9 10 11 12 13 14) do reg add "HKCU\Software\Adobe\CSXS.%%v" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul
if exist "%DEST%" rmdir /s /q "%DEST%"
xcopy "%~dp0ru.splat.penpot2ai" "%DEST%\" /e /i /y /q >nul
if errorlevel 1 (echo ERROR: copy failed & pause & exit /b 1)
for %%f in ("%DEST%\icons\*.b64") do (certutil -f -decode "%%f" "%DEST%\icons\%%~nf" >nul & del "%%f")
echo.
echo Done. Restart Illustrator and open: Window - Extensions - Penpot -^> Illustrator
pause
