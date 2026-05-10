// 验证 SKU 选择状态
// 用法: openclaw browser evaluate --fn "$(cat scripts/verify_sku.js)"
// 返回: JSON { allSelected, selected, unselected, ready }

function() {
  // Try different selectors for SKU items
  let items = document.querySelectorAll("[class*=valueItem--]");
  if (items.length === 0) items = document.querySelectorAll("[class*=skuValue] [class*=valueItem]");
  if (items.length === 0) items = document.querySelectorAll("[class*=sku] [class*=item]");
  if (items.length === 0) return { allSelected: false, error: "no sku items found", ready: false };

  // 按父容器分组
  const groups = [];
  let currentGroup = [];
  let lastParent = null;

  for (const item of items) {
    const parent = item.parentElement;
    if (parent !== lastParent && currentGroup.length > 0) {
      groups.push([...currentGroup]);
      currentGroup = [];
    }
    currentGroup.push(item);
    lastParent = parent;
  }
  if (currentGroup.length > 0) groups.push(currentGroup);

  const selected = [];
  const unselectedGroups = [];

  for (let g = 0; g < groups.length; g++) {
    const group = groups[g];
    let hasSelected = false;

    for (const item of group) {
      if (item.className.includes("isSelected")) {
        selected.push(item.textContent?.substring(0, 30));
        hasSelected = true;
        break;
      }
    }

    if (!hasSelected) {
      // 找第一个可用选项
      const available = [];
      for (const item of group) {
        const cls = item.className || "";
        const isDisabled = cls.includes("disabled") || cls.includes("grey") || cls.includes("gray");
        const isHidden = item.offsetHeight === 0;
        if (!isDisabled && !isHidden) {
          available.push(item.textContent?.substring(0, 20));
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
    groupCount: groups.length
  };
}
