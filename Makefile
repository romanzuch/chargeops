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
	docker exec -it chargeops-db psql -U chargeops -d chargeops