# 指数边界 (Boundless Exponent)

数值膨胀 / 放置 / 构筑类 Web 游戏。攻击不断突破更高关卡的异常数据体，用升级、装备、技能、天赋、重构与世界跃迁构筑自己的增长引擎。

- 技术栈：Next.js 15（App Router）+ React 19 + TypeScript，运行时零第三方依赖
- 大数：自研 BigNumber（mantissa × 10^exponent）
- 音效：WebAudio 合成
- 存储：本地 localStorage + 登录后云存档（node:sqlite）

## 本地开发

```bash
npm install
npm run dev
```

打开 http://localhost:3000

## 测试

```bash
npm test            # 单元 + 引擎冒烟 + 平衡 + 存档 + SSR 冒烟
npm run test:api     # 登录/云存档/排行榜 API 端到端（需先 build）
npx tsc --noEmit
npm run build
```

## 部署（生产）

见 `docker-compose.yml`：`docker compose up -d --build`（端口 127.0.0.1:8373，子路径 `/index-boundary`）。