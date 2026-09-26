import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const appPath = new URL("app.js", import.meta.url);
const htmlPath = new URL("index.html", import.meta.url);
const cssPath = new URL("styles.css", import.meta.url);
const source = fs.readFileSync(appPath, "utf8");
const html = fs.readFileSync(htmlPath, "utf8");
const css = fs.readFileSync(cssPath, "utf8");
const definitions = source.slice(0, source.indexOf('document.addEventListener("keydown"'));
const context = { document: { querySelectorAll: () => [] }, URL, console };
vm.createContext(context);
vm.runInContext(`${definitions}\nthis.preview = { buildSequence, instructionFor, RESPONSES };`, context);

const { buildSequence, instructionFor, RESPONSES } = context.preview;
const phrase = {
  attributeA: "یک کلمه خوب",
  attributeB: "یک کلمه بد",
  targetA: "چهره یک فرد ایرانی",
  targetB: "چهره یک فرد افغان"
};
const relevantCategories = {
  attribute: ["attributeA", "attributeB"],
  target: ["targetA", "targetB"],
  combined: ["attributeA", "attributeB", "targetA", "targetB"]
};

for (const group of [1, 2]) {
  const blocks = buildSequence(group);
  assert.equal(blocks.length, 7, `group ${group} should retain seven blocks`);
  for (const block of blocks) {
    const instruction = instructionFor(block);
    assert.match(instruction, /لطفاً تا حد امکان سریع پاسخ دهید./);
    assert.doesNotMatch(instruction, /با دقت|اشتباه کمتری|کمتر اشتباه|خطای کمتر|مواردی که به دسته/);

    for (const side of ["left", "right"]) {
      const expected = relevantCategories[block.kind]
        .filter(category => block.mapping[category] === side)
        .map(category => phrase[category])
        .join(" یا ");
      const response = RESPONSES[side];
      assert.ok(instruction.includes(`اگر ${expected} را دیدید`), `group ${group}, block ${block.part}, ${side} categories`);
      assert.ok(instruction.includes(`کلید <strong>${response.key}</strong> مربوط به پاسخ ${response.sideLabel}`), `group ${group}, block ${block.part}, ${side} key`);
      assert.ok(instruction.includes(`دکمه ${response.sideLabel} صفحه را لمس کنید`), `group ${group}, block ${block.part}, ${side} touch control`);
    }
    if (block.kind === "combined") assert.match(instruction, / یا /);
  }
}

assert.match(html, /id="left-response"[\s\S]*?<span class="key">E<\/span>/);
assert.match(html, /id="right-response"[\s\S]*?<span class="key">I<\/span>/);
assert.match(css, /\.face-row img[^}]*object-fit: contain/);
assert.match(css, /\.stimulus img[^}]*object-fit: contain/);

console.log("Verified dynamic instructions and response mappings for all 7 blocks in groups 1 and 2.");
console.log("Verified E/left and I/right controls plus non-cropping overview and trial image styles.");
