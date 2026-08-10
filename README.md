# 指数边界 Boundless Exponent

一款使用 **Next.js + TypeScript** 开发的数值膨胀 / 放置 / 构筑类 Web 游戏。

核心乐趣是「增长公式、倍率乘区、Build 构筑、阶段突破、重置成长」：攻击不断突破更高关卡的异常数据体，用升级、装备、技能、天赋、重构与世界跳跃，构筑自己的增长引擎。

> 在线体验：https://amtopa.com/index-boundary

## 玩法亮点

- **战斗**：点击 / 自动攻击、暴击与多重暴击、连击、Boss 词缀与时间限制、碾压跳关、溢出伤害
- **装备**：稀有度、主属性、副词条、传奇词条、强化 / 重铸 / 分解 / 制作 / 套装 / 自动分解
- **技能**：主动 + 被动，冷却、持续、自动释放，技能流 Build
- **天赋**：数值节点 / Build 节点 / 机制节点 / Keystone 核心天赋
- **世界**：阶段推进、世界法则（可修改规则的世界机制）
- **转生**：第一层重构（重置成长）+ 第二层跳跃（改变增长公式）
- **大数**：自研 BigNumber（尾数 × 10^指数），支持 1e308 以上的超大数值
- **账号**：登录 + 云存档 + 排行榜
- **离线**：数学估算式离线收益，不做暴力逐 tick 模拟

## 技术栈

- Next.js 15（App Router）+ React 19 + TypeScript
- 游戏引擎与 React 渲染分离（GameEngine / TickManager / 各 System）
- 自研 BigNumber（mantissa × 10^exponent），运行时零第三方数值依赖
- WebAudio 合成音效
- localStorage + 云存档（node:sqlite）
- PWA：manifest + 多尺寸图标（favicon / apple-touch / android-chrome / og-image）

## 本地开发

```bash
npm install
npm run dev
```

打开 http://localhost:3000。

## 测试

```bash
npm test             # 单元 + 引擎冒烟 + 平衡 + 存档 + SSR + 验收
npm run test:api     # 登录 / 云存档 / 排行榜 API 端到端（需先 build）
npx tsc --noEmit
npm run build
```

## 目录结构（要点）

- `src/game/` —— 游戏引擎、数值、存档、模拟器（与 React 解耦）
- `src/game/data/` —— 数据驱动配置（技能 / 装备 / 天赋 / 世界 / 成就 / 道具）
- `src/game/systems/` —— 技能 / 天赋 / 转生 / 法则 / 每日等系统
- `src/components/` —— UI 组件（只负责显示与交互）
- `src/app/api/` —— 登录 / 云存档 / 排行榜接口
- `scripts/` —— 冒烟、平衡、验收、图标生成等工具脚本
- `public/` —— 静态资源与多版本图标

## 图标

`public/` 下包含多版本图标：favicon（16 / 32 / 48 / 96 + .ico）、apple-touch-icon（180）、android-chrome（192 / 512）、og-image（1200×630）与源 SVG。重新生成：

```bash
node scripts/gen-icons.mjs
```