// 存档系统测试：导出/导入/校验和/注入存储 save-load 往返
import { setStorage, exportSave, importSave, saveGame, loadGame, clearSave, fnv1a, makeSave } from "../src/game/save";
import { createNewState } from "../src/game/engine";

let failed = false;
function check(name: string, cond: boolean): void {
  if (!cond) { console.error(`  ✗ ${name}`); failed = true; }
  else console.log(`  ✓ ${name}`);
}

const st = createNewState(777);
st.combat.stage = 123;
st.player.gold = [4.2, 30];

const text = exportSave(st);
const back = importSave(text);
check("导出/导入往返", back !== null && back.combat.stage === 123 && back.player.gold[1] === 30);

const tampered = JSON.parse(text) as { state: { combat: { stage: number } } };
tampered.state.combat.stage = 999;
check("篡改校验失败", importSave(JSON.stringify(tampered)) === null);
check("非法输入返回 null", importSave("garbage") === null);
check("fnv1a 格式", /^[0-9a-f]{8}$/.test(fnv1a("x")));
check("makeSave 字段", makeSave(st).format === "index-boundary-save");

// 注入内存存储
const mem = new Map<string, string>();
setStorage({
  getItem: (k) => mem.get(k) ?? null,
  setItem: (k, v) => { mem.set(k, v); },
  removeItem: (k) => { mem.delete(k); },
});
saveGame(st);
const loaded = loadGame();
check("save/load 往返", loaded !== null && loaded.state.combat.stage === 123 && !loaded.fromBackup);
clearSave();
check("clearSave 后为空", loadGame() === null);
setStorage(null);

console.log(failed ? "存档测试失败" : "存档测试通过 ✓");
process.exit(failed ? 1 : 0);