FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source and build
COPY . .
RUN npm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Install serve
RUN npm install -g serve

# Copy built assets
COPY --from=builder /app/dist ./dist

EXPOSE 3102

CMD ["serve", "-s", "dist", "-l", "3102"]
