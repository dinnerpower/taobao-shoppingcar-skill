// 检查商品详情页是否有好评率 (WSL 优化版)
// 用法: openclaw browser evaluate --fn "$(cat scripts/check_rating.js)"
// 返回: JSON { found, rating, method }
//
// 好评率常见位置:
// - 店铺评分区域 "好评率 99.5%"
// - 商品评价概览 "好评率XX%"
// - 宝贝评价 tab 附近
//
// 改进点（来自 Hermes 实测）:
// 1. 先检查顶部"好评率"文字
// 2. 没找到则滚动到评价区（1500px / 3500px）
// 3. 再检查一次

function() {
  // 方法1: 检查顶部区域的"好评率"文本
  const bodyText = document.body.innerText || "";
  let match = bodyText.match(/好评率[\s:：]*(\d+\.?\d*)%/);
  if (match) {
    return { found: true, rating: parseFloat(match[1]), method: "好评率" };
  }

  // 方法2: 搜索"好评"关键词
  const haopingMatch = bodyText.match(/好评[\s:：]*(\d+\.?\d*)%/);
  if (haopingMatch) {
    return { found: true, rating: parseFloat(haopingMatch[1]), method: "好评" };
  }

  // 方法3: 搜索含"好评"的元素（可能在隐藏的 tab 或折叠区）
  const allElements = document.querySelectorAll("*");
  for (const el of allElements) {
    if (el.children.length > 0) continue; // 只检查叶子节点
    const text = el.textContent || "";
    if (text.includes("好评率") || text.includes("好评")) {
      const m = text.match(/(\d+\.?\d*)\s*%/);
      if (m) {
        return { found: true, rating: parseFloat(m[1]), method: "好评(叶子节点)", text: text.trim().substring(0, 30) };
      }
    }
  }

  // 方法4: 滚动页面触发懒加载后再检查（评价内容通常在页面靠下位置）
  window.scrollTo(0, 1500);
  // 方法5: 再往下滚
  window.scrollTo(0, 3500);

  // ⚠️ 注意: 调用方在 evaluate 后等几秒再调一次才能拿到懒加载后的数据
  // 这里仅触发滚动，不重复查找

  return { found: false };
}
