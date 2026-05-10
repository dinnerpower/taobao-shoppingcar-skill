// 验证 SKU 选择状态 (WSL 优化版)
// 用法: openclaw browser evaluate --fn "$(cat scripts/verify_sku.js)"
// 返回: JSON { allSelected, selected, unselected, ready }
//
// 改进点：
// 1. 过滤子元素（同 select_sku.js）
// 2. 按 skuItem 祖先分组

function() {
  let items = document.querySelectorAll("div[class*=valueItem--]");
  if (items.length === 0) {
    items = document.querySelectorAll("[class*=skuValue] [class*=valueItem]");
  }
  if (items.length === 0) {
    items = document.querySelectorAll("[class*=sku] [class*=item]");
  }
  if (items.length === 0) return { allSelected: false, error: "no sku items found", ready: false };

  // 过滤子元素
  const topLevelItems = [];
  for (const item of items) {
    const parent = item.parentElement;
    if (parent && parent.className && parent.className.includes('valueItem--')) continue;
    topLevelItems.push(item);
  }

  // 按 skuItem 祖先分组
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

  // 回退到父容器分组
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
  const unselectedGroups = [];

  for (let g = 0; g < effectiveGroups.length; g++) {
    const group = effectiveGroups[g];
    let hasSelected = false;

    for (const item of group) {
      if (item.className.includes("isSelected")) {
        selected.push(item.textContent?.trim().substring(0, 30) || "(选中)");
        hasSelected = true;
        break;
      }
    }

    if (!hasSelected) {
      const available = [];
      for (const item of group) {
        const cls = item.className || "";
        const isDisabled = cls.includes("disabled") || cls.includes("grey") || cls.includes("gray");
        const isHidden = item.offsetHeight === 0;
        if (!isDisabled && !isHidden) {
          available.push(item.textContent?.trim().substring(0, 20) || "(选项)");
        }
      }
      unselectedGroups.push({ group: g, available });
    }
  }

  return {
    allSelected: unselectedGroups.length === 0,
    selected,
    unselectedGroups,
    ready: unselectedGroups.length === 0,
    groupCount: effectiveGroups.length
  };
}
