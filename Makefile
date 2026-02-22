.PHONY: db-up db-down db-reset db-logs db-psql db-test-up db-test-down db-test-logs db-test-psql

db-up:
	docker compose up -d db

db-down:
	docker compose down

db-reset:
	docker compose down -v
	docker compose up -d db

db-logs:
	docker compose logs -f db

db-psql:
	docker exec -it chargeops-db psql -U chargeops -d chargeops

# --- Test DB (loads .env.test explicitly) ---
db-test-up:
	docker compose --env-file .env.test up -d db_test

db-test-down:
	docker compose --env-file .env.test down db_test

db-test-logs:
	docker compose --env-file .env.test logs -f db_test

db-test-psql:
	docker exec -it chargeops-db-test psql -U chargeops -d chargeops_test