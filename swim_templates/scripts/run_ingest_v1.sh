#!/bin/bash
# Convenience script to run template ingestion (Unix/Linux/macOS)

cd "$(dirname "$0")/../.." || exit 1
python3 swim_templates/scripts/ingest_v1.py
