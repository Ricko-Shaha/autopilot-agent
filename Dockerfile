# Zero-dependency runtime: just Node 22 + the source. No `npm install` needed.
FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
ENV PORT=8787
ENV LLM_PROVIDER=qwen
EXPOSE 8787
# Node 22 strips TypeScript types natively — no build step.
CMD ["node", "--experimental-strip-types", "src/server.ts"]
