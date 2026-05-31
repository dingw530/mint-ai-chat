# ============================================================
# Zephyr AI Chat — 多阶段 Docker 构建
# ============================================================

# Stage 1: Build
FROM node:22-alpine AS build

# 编译 better-sqlite3 所需的系统工具
RUN apk add --no-cache python3 make g++

WORKDIR /app

# 先复制依赖声明 → 利用 Docker 缓存层
COPY server/package*.json server/
RUN cd server && npm ci

COPY client/package*.json client/
RUN cd client && npm ci

# 复制源码并构建
COPY server/ server/
COPY client/ client/

RUN cd server && npm run build
RUN cd client && npm run build

# 清理 server 开发依赖（缩小生产镜像）
RUN cd server && npm prune --production

# ============================================================
# Stage 2: Production
FROM node:22-alpine

# tini — 正确处理 PID 1 信号转发
RUN apk add --no-cache tini
ENTRYPOINT ["/sbin/tini", "--"]

WORKDIR /app

# 仅复制运行时必需的产物
COPY --from=build /app/server/dist server/dist/
COPY --from=build /app/server/node_modules server/node_modules/
COPY --from=build /app/client/dist client/dist/
COPY server/package.json server/

EXPOSE 3001

# 环境变量（运行时必须设置）：
#   AI_CHAT_ENCRYPTION_KEY  — 必填，API 密钥加密
#   AI_CHAT_CLIENT_DIST     — 必填，前端静态文件路径（设为 /app/client/dist）
#   AI_CHAT_DB_PATH         — 可选，默认 /app/server/dist/data.db
#   PORT                    — 可选，默认 3001
CMD ["node", "server/dist/index.js"]
