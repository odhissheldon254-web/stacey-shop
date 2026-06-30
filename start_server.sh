#!/bin/bash
# Tacey Collections Local Server Launcher (macOS / Linux)

echo "Starting Stacey's Shop Server..."
# Wait 1.5 seconds for server initiation, then open default web browser
(sleep 1.5 && (open http://localhost:8080 || xdg-open http://localhost:8080)) &

# Start python http server
python3 -m http.server 8080
