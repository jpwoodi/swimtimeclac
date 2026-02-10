@echo off
REM Convenience script to run template ingestion (Windows)

cd /d "%~dp0..\.."
python swim_templates\scripts\ingest_v1.py
