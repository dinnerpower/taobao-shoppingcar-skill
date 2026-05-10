// 点击"销量"排序按钮
// 用法: openclaw browser evaluate --fn "$(cat scripts/sort_by_sales.js)"
// 返回: JSON { success, currentSort }

function() {
  // 方法1: 用 data-spm 属性定位（最可靠）
  let el = document.querySelector('[data-spm="_sale"]');
  if (el) {
    el.click();
    return { success: true, method: "data-spm" };
  }

  // 方法2: 用 role=tab + 文字匹配
  const tabs = document.querySelectorAll('[role="tab"]');
  for (const tab of tabs) {
    if (tab.textContent?.includes("销量")) {
      tab.click();
      return { success: true, method: "role+text" };
    }
  }

  // 方法3: 用 class 包含 tab + inner 文字
  const tabInners = document.querySelectorAll('[class*="tab"] [class*="inner"]');
  for (const inner of tabInners) {
    if (inner.textContent?.trim() === "销量") {
      inner.parentElement.click();
      return { success: true, method: "class+inner" };
    }
  }

  return { success: false, error: "未找到销量排序按钮" };
}
