# Stage 1: Build
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_ADSENSE_CLIENT
ARG VITE_AD_SLOT_LANDING_TOP
ARG VITE_AD_SLOT_LANDING_BOTTOM
ARG VITE_AD_SLOT_SCANNER_TOP
ARG VITE_AD_SLOT_SCANNER_BOTTOM
ARG VITE_GA_MEASUREMENT_ID
ARG VITE_BASE_PATH=/
RUN npm run build

# Stage 2: Serve
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
