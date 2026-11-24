#!/bin/bash
# ダブルクリックで「書く」画面を開きます
cd "$(dirname "$0")"
exec python3 server.py
