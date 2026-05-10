// SKU 自动选择脚本 (WSL 优化版)
// 用法: openclaw browser evaluate --fn "$(cat scripts/select_sku.js)"
// 功能: 自动选择所有可用的 SKU 选项，逐组选择
// 返回: JSON { success, selected, error }
//
// 改进点（来自 Hermes 版实测经验）:
// 1. 过滤子元素: [class*=valueItem--] 会匹配子元素（valueItemImgWrap--, valueItemText--）
//    需要检查父元素也包含 valueItem-- 来跳过
// 2. 用 skuItem-- 祖先定位分组（Tmall 专用），而不是直接父容器
// 3. 点击前 scrollIntoView 确保可见
// 4. 当有多个选项时，跳过"随机"/"官方正品"等模糊选项

function() {
  const allItems = document.querySelectorAll("div[class*=valueItem--]");
  if (allItems.length === 0) return { success: false, error: "no sku items found" };

  // 过滤掉子元素（父元素也包含 valueItem-- 的是被嵌套的子项）
  const topLevelItems = [];
  for (const item of allItems) {
    const parent = item.parentElement;
    if (parent && parent.className && parent.className.includes('valueItem--')) {
      continue;
    }
    topLevelItems.push(item);
  }

  if (topLevelItems.length === 0) return { success: false, error: "no top-level sku items" };

  // 按 skuItem 祖先分组（Tmall 专用逻辑）
  const groups = [];
  let currentGroup = [];
  let lastSkuParent = null;

  for (const item of topLevelItems) {
    let skuParent = item.parentElement;
    while (skuParent && !skuParent.className.includes('skuItem')) {
      skuParent = skuParent.parentElement;
    }
    if (skuParent !== lastSkuParent && currentGroup.length > 0) {
      groups.push([...currentGroup]);
      currentGroup = [];
    }
    currentGroup.push(item);
    lastSkuParent = skuParent;
  }
  if (currentGroup.length > 0) groups.push(currentGroup);

  // 如果 skuItem 分组没分出来（比如淘宝不是天猫），回退到父容器分组
  const effectiveGroups = groups.length > 1 ? groups : (() => {
    const g = []; let cur = [], lp = null;
    for (const item of topLevelItems) {
      const p = item.parentElement;
      if (p !== lp && cur.length > 0) { g.push([...cur]); cur = []; }
      cur.push(item); lp = p;
    }
    if (cur.length > 0) g.push(cur);
    return g;
  })();

  const selected = [];

  for (let g = 0; g < effectiveGroups.length; g++) {
    const group = effectiveGroups[g];
    let clicked = false;

    // 先检查是否已有选中项
    for (const item of group) {
      if (item.className.includes("isSelected")) {
        selected.push(item.textContent?.trim().substring(0, 30) || "(选中)");
        clicked = true;
        break;
      }
    }
    if (clicked) continue;

    // 没有选中项，选第一个可用选项
    // 如果是第一组（颜色），并且有多个选项，跳过"随机"、"官方正品"等模糊选项
    const isFirstGroup = (g === 0 && group.length > 1);
    for (const item of group) {
      const cls = item.className || "";
      const isDisabled = cls.includes("disabled") || cls.includes("grey") || cls.includes("gray");
      const isHidden = item.offsetHeight === 0;
      if (isDisabled || isHidden) continue;

      const text = item.textContent?.trim() || "";

      // 第一组有多个选项时，跳过模糊选项
      if (isFirstGroup && (text.includes('随机') || text.includes('官方正品'))) continue;

      item.scrollIntoView({ behavior: 'instant', block: 'center' });
      const e = new MouseEvent("click", { bubbles: true, cancelable: true, view: window });
      item.dispatchEvent(e);

      selected.push(text.substring(0, 30) || "(选项)");
      clicked = true;
      break;
    }

    if (!clicked) {
      return { success: false, error: "no available option in group " + g, selected };
    }
  }

  return { success: true, selected, groupCount: effectiveGroups.length };
}
