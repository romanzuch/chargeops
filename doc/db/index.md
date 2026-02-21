# Database

## Prerequisites
- Docker (Docker Desktop) incl. Docker Compose v2 (`docker compose ...`)

## Setup
1. Start Postgres
```bash
docker compose up -d
```

2. Check status/health
```bash
docker compose ps
```

3. Follow logs
```bash
docker compose logs -f db
```

## Connect via psql
From inside the container (no host setup required):
```bash
docker exec -it chargeops-db psql -U POSTGRES_USER -d POSTGRES_DB
```

Connection string example: `postgresql://chargeops:change-me@localhost:5432/chargeops`

### Stop/Reset
```bash
docker compose down
```

### Hard reset
Warning: this also deletes the db volume.
```bash
docker compose down -v
```

## Makefile
```Makefile
.PHONY: db-up db-down db-reset db-logs db-psql

db-up:
	docker compose up -d

db-down:
	docker compose down

db-reset:
	docker compose down -v
	docker compose up -d

db-logs:
	docker compose logs -f db

db-psql:
	docker exec -it chargeops-db psql -U $$POSTGRES_USER -d $$POSTGRES_DB
```