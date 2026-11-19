# Deploy the Plane-embedded frontend to the Relyon VPS

Project tabs (Work Items, Cycles, Modules, Views, Pages, Intake) frame the real Plane.
Nothing is copied: the data lives in Plane, so features match Plane exactly.

## 0. Prerequisites (once)

- Plane reachable over HTTPS at one address, e.g. `https://project.relyonhub.cloud`
  (needs a DNS A record to the VPS and a Traefik router for it). It must be on the
  same registrable domain as AgenticOS so login cookies work inside the frame.
- Plane must allow being framed by AgenticOS. Check:
  `curl -sI https://<plane-host>/ | grep -iE 'x-frame|content-security'`
  No output is fine. If `X-Frame-Options: DENY/SAMEORIGIN` or a `frame-ancestors`
  appears, remove it or allow `https://relios.relyonhub.cloud` in Traefik/Plane.

## 1. Image

Run the "Relyon frontend image" workflow (it also runs on every push to the branch).
Tag: `ghcr.io/relyondev/agenticos-frontend:1.38.2-planning.2`.

## 2. Deploy (on the VPS)

```bash
cd /opt/relios-agenticos
cp docker-compose-prod.frontend.yml docker-compose-prod.frontend.yml.bak
```

Fetch the new overlay (or copy it from the repo) and set the Plane address:

```bash
curl -fsSL https://raw.githubusercontent.com/relyondev/agenticos/relyon/project-planning/docker-compose-prod.frontend.plane.yml -o docker-compose-prod.frontend.plane.yml
echo 'PLANE_URL=https://project.relyonhub.cloud' >> backend/.env
sed -i 's#ghcr.io/vstorm-co/agenticos-frontend:${AGENTICOS_VERSION:-latest}#ghcr.io/relyondev/agenticos-frontend:1.38.2-planning.2#' docker-compose-prod.frontend.yml
```

```bash
docker compose -p relios-agenticos-frontend --env-file backend/.env \
  -f docker-compose-prod.frontend.yml -f docker-compose-prod.frontend.traefik.yml \
  -f docker-compose-prod.frontend.plane.yml pull
docker compose -p relios-agenticos-frontend --env-file backend/.env \
  -f docker-compose-prod.frontend.yml -f docker-compose-prod.frontend.traefik.yml \
  -f docker-compose-prod.frontend.plane.yml up -d
```

All three `-f` files and `-p relios-agenticos-frontend` are required (labels/network
for Traefik, `PLANE_URL` for the embed, the existing project name).

## 3. Link a project

Open a project, any planning tab, paste the Plane project address
(`https://<plane>/<workspace>/projects/<id>/issues`) and press Link. The pointer is
saved in the project's files as `Project Planning/plane.json`.

## Roll back

```bash
cd /opt/relios-agenticos
mv docker-compose-prod.frontend.yml.bak docker-compose-prod.frontend.yml
docker compose -p relios-agenticos-frontend --env-file backend/.env \
  -f docker-compose-prod.frontend.yml -f docker-compose-prod.frontend.traefik.yml up -d
```
