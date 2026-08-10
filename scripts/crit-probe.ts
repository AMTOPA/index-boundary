// 探查：纯自动（只买暴击率）下暴击率随时间的增长（探查用）
import { GameEngine, createNewState } from "../src/game/engine";
import { CONFIG } from "../src/game/config";

const eng = new GameEngine(createNewState(1));
const dt = 1 / CONFIG.TICK_RATE;
const ticks = Math.floor(10 * 60 / dt);
let buy = 0;
for (let i = 0; i < ticks; i++) {
  eng.tick(dt);
  if (eng.state.combat.isBoss) eng.click();
  else if (i % 20 === 0) eng.click();
  buy++;
  if (buy >= 10) {
    buy = 0;
    eng.smartBuy();
  }
  const sec = Math.floor(eng.timeSec);
  if (sec % 60 === 0 && (i % 20 === 0)) {
    console.log(`t=${sec}s stage=${eng.state.combat.stage} critLv=${eng.state.player.upgrades.critChance} critChance=${eng.derived.critChance.toFixed(4)} dpsMag=${eng.derived.dps.log10().toFixed(2)}`);
  }
}