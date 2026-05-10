// 检测验证码和登录拦截
// 用法: openclaw browser evaluate --fn "$(cat scripts/check_blocker.js)"
// 返回: JSON { blocked, type, message }
// type: "login" | "captcha" | "slider" | "none"

function() {
  const url = window.location.href;
  const text = document.body.innerText;

  // 检测登录拦截
  if (url.includes("login") || text.includes("亲，请登录") || text.includes("请先登录")) {
    return { blocked: true, type: "login", message: "需要登录淘宝" };
  }

  // 检测滑块验证码
  const slider = document.querySelector("[class*=baxia], [id*=nc_1], [class*=nc-container], [class*=slidetounlock], [class*=slider]");
  if (slider && slider.offsetHeight > 0) {
    return { blocked: true, type: "slider", message: "遇到滑块验证码" };
  }

  // 检测图片验证码
  const captcha = document.querySelector("[class*=captcha], [class*=Captcha], [id*=captcha], iframe[src*=captcha], iframe[src*=punish]");
  if (captcha && captcha.offsetHeight > 0) {
    return { blocked: true, type: "captcha", message: "遇到图片验证码" };
  }

  // 检测风控拦截
  if (text.includes("为了您的安全") || text.includes("请完成验证") || text.includes("访问受限")) {
    return { blocked: true, type: "captcha", message: "被风控拦截，需要验证" };
  }

  return { blocked: false, type: "none", message: "" };
}
