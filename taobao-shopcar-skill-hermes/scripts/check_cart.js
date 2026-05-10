// 获取购物车数量
// 用法: openclaw browser evaluate --fn "$(cat scripts/check_cart.js)"
// 返回: JSON { count, url }

function() {
  const text = document.body.innerText;
  const match = text.match(/购物车\s*(\d+)/);
  return {
    count: match ? parseInt(match[1]) : 0,
    url: window.location.href.substring(0, 80)
  };
}
