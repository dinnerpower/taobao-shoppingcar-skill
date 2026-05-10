// 从搜索结果页提取商品 ID 列表 (WSL 优化版)
// 用法: openclaw browser evaluate --fn "$(cat scripts/extract_product_ids.js)"
// 返回: JSON { count, products: [{id, title, price, sales}] }
//
// 改进: 更好的链接匹配，支持天猫/淘宝/detail 多种 URL 格式

function() {
  const products = [];
  const seen = new Set();

  // 匹配所有包含商品 ID 的链接
  const links = document.querySelectorAll("a[href*='item.htm'], a[href*='detail.tmall'], a[href*='item.tmall']");

  for (const link of links) {
    const href = link.href || "";
    const match = href.match(/id=(\d{8,})/);
    if (!match) continue;

    const id = match[1];
    if (seen.has(id)) continue;
    seen.add(id);

    // 提取标题
    const titleEl = link.querySelector("[class*=title], [class*=Title], [class*=TitleItem]")
      || link.querySelector("img[alt]")
      || link;
    let title = "";
    if (titleEl.tagName === "IMG") {
      title = (titleEl.getAttribute("alt") || "").trim().substring(0, 60);
    } else {
      title = (titleEl.textContent || "").trim().replace(/\s+/g, " ").substring(0, 60);
    }

    // 提取价格
    let price = "";
    const priceEl = link.querySelector("[class*=price], [class*=Price]");
    if (priceEl) {
      const pt = priceEl.textContent?.trim() || "";
      const pm = pt.match(/[¥￥]\s*[\d.]+/);
      if (pm) price = pm[0];
    }

    // 提取销量
    let sales = "";
    const text = link.textContent || "";

    // 从销量元素提取
    const salesEl = link.querySelector("[class*=sales], [class*=Sales], [class*=sold], [class*=count]");
    if (salesEl) sales = salesEl.textContent?.trim() || "";

    // 备用：从文本中提取
    if (!sales) {
      const salesMatch = text.match(/(\d+[\+\.万]*\s*人[付购买][款买]?)/);
      if (salesMatch) sales = salesMatch[1];
    }

    if (!price && !title && !sales) continue;

    products.push({ id: id, title: title, price: price, sales: sales });
  }

  return { count: products.length, products: products };
}
