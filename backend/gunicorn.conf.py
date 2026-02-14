"""
Gunicorn configuration for production deployment.
Usage: gunicorn -c gunicorn.conf.py main:app
"""
import multiprocessing
import os

# Bind
bind = os.environ.get("BIND", "0.0.0.0:8000")

# Workers — 2 × CPU + 1 is the standard recipe
workers = int(os.environ.get("WORKERS", min(multiprocessing.cpu_count() * 2 + 1, 8)))
worker_class = "uvicorn.workers.UvicornWorker"

# Timeouts
timeout = 120          # Kill workers that hang for 2 minutes
graceful_timeout = 30  # Grace period after SIGTERM
keepalive = 5          # Keep TCP connections alive for pipelining

# Logging
accesslog = "-"        # stdout
errorlog = "-"         # stderr
loglevel = os.environ.get("LOG_LEVEL", "info")

# Security
limit_request_line = 8190
limit_request_fields = 100
limit_request_field_size = 8190

# Process naming
proc_name = "cabinet-bidding-api"

# Preload app for faster worker spawns (shares memory via copy-on-write)
preload_app = True

def on_starting(server):
    server.log.info("Cabinet Bidding API — Starting Gunicorn with %d workers", workers)

def on_exit(server):
    server.log.info("Cabinet Bidding API — Gunicorn shutting down")
