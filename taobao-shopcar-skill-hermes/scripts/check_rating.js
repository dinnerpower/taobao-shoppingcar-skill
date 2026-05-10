// 检查商品详情页是否有好评率
// 用法: openclaw browser evaluate --fn "$(cat scripts/check_rating.js)"
// 返回: JSON { found, rating }
//
// 好评率常见位置:
// - 店铺评分区域 "好评率 99.5%"
// - 商品评价概览 "好评率XX%"
// - 宝贝评价 tab 附近

function() {
  const bodyText = document.body.innerText || "";

  // 方法1: 直接搜索"好评率"文本
  const match = bodyText.match(/好评率[\s:：]*(\d+\.?\d*)%/);
  if (match) {
    return { found: true, rating: parseFloat(match[1]), text: match[0] };
  }

  // 方法2: 搜索"好评"关键词
  const haopingMatch = bodyText.match(/好评\s*(\d+\.?\d*)%/);
  if (haopingMatch) {
    return { found: true, rating: parseFloat(haopingMatch[1]), text: haopingMatch[0] };
  }

  // 方法3: 搜索含"好评"的元素（可能在隐藏的 tab 或折叠区）
  const allElements = document.querySelectorAll("*");
  for (const el of allElements) {
    if (el.children.length > 0) continue; // 只检查叶子节点
    const text = el.textContent || "";
    if (text.includes("好评率") || text.includes("好评")) {
      const m = text.match(/(\d+\.?\d*)\s*%/);
      if (m) {
        return { found: true, rating: parseFloat(m[1]), text: text.trim().substring(0, 30) };
      }
    }
  }

  // 方法4: 尝试滚动页面后再检查（懒加载内容可能在底部）
  window.scrollTo(0, document.body.scrollHeight * 0.3);
  // 等一下（调用方会 sleep 后再查，这里只是触发可能的懒加载）

  return { found: false };
}
