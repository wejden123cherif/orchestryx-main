
@echo off
REM Wrapper script to invoke app.py safely from CDK.
REM CDK on Windows splits the "app" command on spaces, which breaks
REM when the working directory path contains spaces (e.g. "Aws Project").
REM Using a .bat file avoids this because CDK passes the entire filename
REM as a single argument to cmd.exe.
python "%~dp0app.py" %*
