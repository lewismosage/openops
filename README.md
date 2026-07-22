# OpenOps

A lightweight developer operations console to monitor multiple servers and **notify you when something goes wrong**.

## What it does

- Register and manage all your servers in one dashboard
- Add **HTTP / TCP / ping** health checks from the UI
- Run a small agent on each server for **CPU / RAM / disk** plus optional **log excerpts**
- Open incidents that show **which server broke**, the error, and recent logs
- Alert via **Discord**, **Telegram**, **email**, or **webhook**
- Mark incidents resolved when things recover (automatic or manual)

## Quick start (local)

### 1. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000

### 3. Add a server

1. Add a server in the dashboard
2. Expand it and add health checks (or copy the agent token)
3. On the server, run:

```bash
pip install -r agent/requirements.txt
python agent/agent.py --hub http://YOUR_HUB_IP:8000 --token YOUR_TOKEN
```

Optional: ship recent log lines from a file (or journalctl when available):

```bash
python agent/agent.py --hub http://YOUR_HUB_IP:8000 --token YOUR_TOKEN --log-file /var/log/myapp.log
```

### 4. Notifications

In the dashboard Notifications panel, add Discord / Telegram / webhook / email. Alerts look like:

```
[DOWN] Ubuntu-03 (production)
Server `Ubuntu-03` is now down.
Host: 10.0.0.5
Check: API health
Error: Connection refused

Recent logs:
...
```

## Docker

Backend only (recommended while developing the frontend with `npm run dev`):

```bash
docker compose up --build backend
```

Full stack:

```bash
docker compose --profile full up --build
```

- Dashboard: http://localhost:3000
- API: http://localhost:8000
- API docs: http://localhost:8000/docs

## Roadmap (later)

1. Centralized log shipping (Grafana Loki / collector)
2. SSH actions from the dashboard
3. AI diagnosis across metrics + logs
4. Deployment tracking
5. Multi-user auth with roles

## Architecture

```
┌─────────────┐     heartbeat      ┌──────────────┐
│ OpenOps     │ ◄───────────────── │ Agent        │
│ Agent       │   metrics + logs   │ (each server)│
└─────────────┘                    └──────────────┘
       │
       ▼
┌──────────────┐   health checks   ┌──────────────┐
│ OpenOps Hub  │ ────────────────► │ Your servers │
│ (FastAPI)    │                   │ HTTP/TCP/ping│
└──────────────┘                   └──────────────┘
       │
       ├──► SQLite (servers, checks, metrics, incidents)
       ├──► Scheduler
       └──► Discord / Telegram / Email / Webhook
```
