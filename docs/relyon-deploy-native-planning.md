# Deploy native project planning (Work Items, Cycles, Modules) to the Relyon VPS

This changes the database (migrations `0251_work_items` and `0252_cycles_modules`) and replaces BOTH the
backend and the frontend image. Do the backup first.

Images (both built by GitHub Actions on branch `relyon/native-planning`):

- `ghcr.io/relyondev/agenticos-backend:1.38.2-planning.2`
- `ghcr.io/relyondev/agenticos-frontend:1.38.2-planning.4`

## 1. Back up the database

```bash
cd /opt/relios-agenticos
docker exec relios-agenticos-db-1 sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > /root/agenticos-before-workitems.sql
ls -lh /root/agenticos-before-workitems.sql
```

## 2. Find which compose files the backend runs with

```bash
docker inspect relios-agenticos-app-1 --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}'
```

Use exactly those files (comma separated list; each becomes one `-f`) in step 3.

## 3. Backend

Back up and edit the image of the `app`, `worker` and `migrate` services
(`ghcr.io/vstorm-co/agenticos-backend:${AGENTICOS_VERSION:-latest}`):

```bash
cp docker-compose-prod.yml docker-compose-prod.yml.bak
sed -i 's#ghcr.io/vstorm-co/agenticos-backend:${AGENTICOS_VERSION:-latest}#ghcr.io/relyondev/agenticos-backend:1.38.2-planning.2#' docker-compose-prod.yml
grep -c 'relyondev/agenticos-backend' docker-compose-prod.yml   # expect 3
```

```bash
docker compose -p relios-agenticos --env-file backend/.env -f docker-compose-prod.yml [-f ...others from step 2] pull
docker compose -p relios-agenticos --env-file backend/.env -f docker-compose-prod.yml [-f ...others from step 2] up -d
docker logs relios-agenticos-migrate-1 2>&1 | tail -3   # expect "Running upgrade 0251_work_items -> 0252_cycles_modules"
```

## 4. Frontend

```bash
cp docker-compose-prod.frontend.yml docker-compose-prod.frontend.yml.bak2
sed -i 's#agenticos-frontend:1.38.2-planning.[0-9]*#agenticos-frontend:1.38.2-planning.4#' docker-compose-prod.frontend.yml
docker compose -p relios-agenticos-frontend --env-file backend/.env \
  -f docker-compose-prod.frontend.yml -f docker-compose-prod.frontend.traefik.yml \
  -f docker-compose-prod.frontend.plane.yml pull
docker compose -p relios-agenticos-frontend --env-file backend/.env \
  -f docker-compose-prod.frontend.yml -f docker-compose-prod.frontend.traefik.yml \
  -f docker-compose-prod.frontend.plane.yml up -d
```

## 5. Check

Open a project > Work Items: add an item, open it, change state, comment, switch to Board.

## Roll back

The migration only adds three tables, so rolling the images back is safe without
touching the data. Restore the `.bak` compose files and `up -d` again with the same
`-f` lists. Only if you must also drop the tables:
`docker exec relios-agenticos-app-1 agenticos db downgrade` (run before swapping the image back).
