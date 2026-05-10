// SKU 自动选择脚本
// 用法: openclaw browser evaluate --fn "$(cat scripts/select_sku.js)"
// 功能: 自动选择所有可用的 SKU 选项，逐组选择，逐个验证
// 返回: JSON { success, selected, error }

function() {
  // Try different selectors for SKU items
  let items = document.querySelectorAll("[class*=valueItem--]");
  if (items.length === 0) items = document.querySelectorAll("[class*=skuValue] [class*=valueItem]");
  if (items.length === 0) items = document.querySelectorAll("[class*=sku] [class*=item]");
  if (items.length === 0) return { success: false, error: "no sku items found" };

  // 按父容器自动分组
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

  for (let g = 0; g < groups.length; g++) {
    const group = groups[g];
    let clicked = false;

    // 先检查是否已有选中项
    let alreadySelected = false;
    for (const item of group) {
      if (item.className.includes("isSelected")) {
        selected.push(item.textContent?.substring(0, 30));
        alreadySelected = true;
        clicked = true;
        break;
      }
    }
    if (alreadySelected) continue;

    // 没有选中项，选第一个可用的
    for (const item of group) {
      const cls = item.className || "";
      const isDisabled = cls.includes("disabled") || cls.includes("grey") || cls.includes("gray");
      const isHidden = item.offsetHeight === 0;
      if (isDisabled || isHidden) continue;

      const e = new MouseEvent("click", { bubbles: true, cancelable: true, view: window });
      item.dispatchEvent(e);

      selected.push(item.textContent?.substring(0, 30) + " (pending)");
      clicked = true;
      break;
    }

    if (!clicked) {
      return { success: false, error: "no available option in group " + g, selected };
    }
  }

  return { success: true, selected, groupCount: groups.length };
}
