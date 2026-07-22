#!/usr/bin/env python3
"""Lightweight OpenOps agent — reports CPU, memory, disk, and recent logs to the hub."""

import argparse
import os
import platform
import shutil
import subprocess
import time
from pathlib import Path

import httpx
import psutil


def collect_metrics() -> dict:
    cpu = psutil.cpu_percent(interval=1)
    memory = psutil.virtual_memory().percent
    disk = (
        psutil.disk_usage("/").percent
        if platform.system() != "Windows"
        else psutil.disk_usage("C:\\").percent
    )
    load_avg = None
    if hasattr(os, "getloadavg"):
        load_avg = os.getloadavg()[0]
    return {
        "cpu_percent": cpu,
        "memory_percent": memory,
        "disk_percent": disk,
        "load_avg": load_avg,
    }


def collect_log_excerpt(log_file: str | None, lines: int = 40) -> str | None:
    if log_file:
        path = Path(log_file)
        if not path.exists():
            return f"[openops] log file not found: {log_file}"
        try:
            content = path.read_text(encoding="utf-8", errors="replace").splitlines()
            return "\n".join(content[-lines:])
        except Exception as exc:
            return f"[openops] failed to read log file: {exc}"

    if shutil.which("journalctl"):
        try:
            result = subprocess.run(
                ["journalctl", "-n", str(lines), "--no-pager", "-o", "short-iso"],
                capture_output=True,
                text=True,
                timeout=10,
            )
            if result.returncode == 0 and result.stdout.strip():
                return result.stdout.strip()
        except Exception:
            pass

    return None


def main() -> None:
    parser = argparse.ArgumentParser(description="OpenOps monitoring agent")
    parser.add_argument("--hub", required=True, help="OpenOps hub URL, e.g. http://localhost:8000")
    parser.add_argument("--token", required=True, help="Agent token from the server record")
    parser.add_argument("--interval", type=int, default=30, help="Heartbeat interval in seconds")
    parser.add_argument(
        "--log-file",
        default=os.environ.get("OPENOPS_LOG_FILE"),
        help="Optional log file to ship recent lines from",
    )
    parser.add_argument("--log-lines", type=int, default=40, help="How many recent log lines to ship")
    args = parser.parse_args()

    url = f"{args.hub.rstrip('/')}/api/agent/heartbeat?token={args.token}"
    print(f"OpenOps agent started. Reporting to {args.hub} every {args.interval}s")

    while True:
        try:
            payload = collect_metrics()
            log_excerpt = collect_log_excerpt(args.log_file, args.log_lines)
            if log_excerpt:
                payload["log_excerpt"] = log_excerpt
            response = httpx.post(url, json=payload, timeout=15)
            if response.status_code == 200:
                data = response.json()
                print(
                    f"[OK] {data['name']}: CPU {payload['cpu_percent']:.1f}% | "
                    f"RAM {payload['memory_percent']:.1f}% | Disk {payload['disk_percent']:.1f}%"
                )
            else:
                print(f"[ERROR] Hub returned {response.status_code}: {response.text}")
        except Exception as exc:
            print(f"[ERROR] Failed to send heartbeat: {exc}")
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
