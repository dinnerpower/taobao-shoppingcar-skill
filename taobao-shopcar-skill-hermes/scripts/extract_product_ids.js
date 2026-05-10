// 从搜索结果页提取商品 ID 列表
// 用法: openclaw browser evaluate --fn "$(cat scripts/extract_product_ids.js)"
// 返回: JSON { count, products: [{id, title, price, sales}] }

function() {
  const products = [];
  const links = document.querySelectorAll("a[href*='item.taobao.com'], a[href*='detail.tmall.com'], a[href*='item.tmall.com']");

  for (const link of links) {
    const href = link.href || "";
    const match = href.match(/id=(\d{8,})/);
    if (!match) continue;

    const id = match[1];
    // 避免重复
    if (products.some(p => p.id === id)) continue;

    // 提取标题
    const titleEl = link.querySelector("[class*=title], [class*=Title]") || link;
    let title = titleEl.textContent?.trim()?.substring(0, 60) || "";
    title = title.replace(/\s+/g, " ").trim();

    // 提取价格
    let price = "";
    const priceEl = link.querySelector("[class*=price], [class*=Price]");
    if (priceEl) price = priceEl.textContent?.trim() || "";

    // 提取销量
    let sales = "";
    const salesEl = link.querySelector("[class*=sales], [class*=Sales], [class*=sold]");
    if (salesEl) sales = salesEl.textContent?.trim() || "";
    // 备用：从文本中提取
    if (!sales) {
      const text = link.textContent || "";
      const salesMatch = text.match(/(\d+[\+万]*人(?:付款|购买|收货))/);
      if (salesMatch) sales = salesMatch[1];
    }

    products.push({ id, title, price, sales });
  }

  return { count: products.length, products };
}
