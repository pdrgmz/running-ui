# ---------- Etapa 1: compilación de la SPA Angular ----------
FROM node:22-alpine AS build

WORKDIR /app

# Instala dependencias primero para aprovechar la caché de Docker.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build -- --configuration production

# ---------- Etapa 2: servidor Nginx ----------
FROM nginx:alpine AS runtime

# Upstream al que Nginx reenvía /api/* (sin barra final).
# Se puede sobrescribir desde Portainer/Compose sin reconstruir la imagen.
ENV API_UPSTREAM=https://running-api.pdrgmz.uk

# Hace que el entrypoint oficial exporte NGINX_LOCAL_RESOLVERS a partir de
# /etc/resolv.conf; la plantilla de Nginx lo usa como resolver DNS.
# El valor 127.0.0.11 es solo un fallback para redes Docker propias.
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
ENV NGINX_LOCAL_RESOLVERS=127.0.0.11

# La imagen oficial de Nginx procesa las plantillas de /etc/nginx/templates
# con envsubst al arrancar y genera /etc/nginx/conf.d/default.conf.
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template

# Salida del builder de Angular 20: dist/running-ui/browser
COPY --from=build /app/dist/running-ui/browser /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1

# nginx:alpine ya arranca Nginx en primer plano como PID 1.
