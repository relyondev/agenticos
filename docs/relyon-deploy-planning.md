# Deploy the planning frontend to the Relyon VPS

Run from your own computer after the "Relyon frontend image" workflow is green and
the package `agenticos-frontend` is public (GitHub > Packages > Package settings > Change visibility).

```bash
ssh root@187.127.220.68
```

On the VPS:

```bash
cd /opt/relios-agenticos
cp docker-compose-prod.frontend.yml docker-compose-prod.frontend.yml.bak
sed -i 's#ghcr.io/vstorm-co/agenticos-frontend:${AGENTICOS_VERSION:-latest}#ghcr.io/relyondev/agenticos-frontend:1.38.2-planning.1#' docker-compose-prod.frontend.yml
docker compose -p relios-agenticos-frontend --env-file backend/.env -f docker-compose-prod.frontend.yml pull
docker compose -p relios-agenticos-frontend --env-file backend/.env -f docker-compose-prod.frontend.yml up -d
docker ps --filter name=frontend --format '{{.Names}} {{.Image}} {{.Status}}'
```

Roll back:

```bash
cd /opt/relios-agenticos
mv docker-compose-prod.frontend.yml.bak docker-compose-prod.frontend.yml
docker compose -p relios-agenticos-frontend --env-file backend/.env -f docker-compose-prod.frontend.yml up -d
```

Always pass `-p relios-agenticos-frontend` (the existing project name on this VPS). A different name creates a second project that fights for port 3000.
Only the frontend container is recreated; backend, database and Plane are untouched.
