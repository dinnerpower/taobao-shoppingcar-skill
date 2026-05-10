// 从搜索结果页提取第一个商品 ID
// 用法: openclaw browser evaluate --fn "$(cat scripts/extract_first_product_id.js)"
// 返回: 商品ID (字符串) 或 null

function() {
  // 方法1: 找包含蓝牙关键词的商品链接
  var links = document.querySelectorAll("a");
  for (var i = 0; i < links.length; i++) {
    var href = links[i].href || "";
    var text = links[i].textContent || "";
    var m = href.match(/id=(\d{8,})/);
    if (m && (href.indexOf("item.htm") > -1 || href.indexOf("detail.tmall") > -1) && !href.includes("error")) {
      // 有标题信息的才视为商品
      if (text.trim().length > 5) {
        return m[1];
      }
    }
  }

  // 方法2: 直接找所有包含 id 且 href 含 item 的链接
  var all = document.querySelectorAll("a[href*='item'], a[href*='detail']");
  for (var i = 0; i < all.length; i++) {
    var href = all[i].href || "";
    var m = href.match(/id=(\d{8,})/);
    if (m && !href.includes("error")) {
      return m[1];
    }
  }

  return null;
}
