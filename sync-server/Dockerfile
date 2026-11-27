FROM node:22-alpine
ENV NODE_ENV=production PORT=8788 DATA_DIR=/data
WORKDIR /app
COPY server.js ./
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8788
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8788/health || exit 1
CMD ["node","server.js"]
