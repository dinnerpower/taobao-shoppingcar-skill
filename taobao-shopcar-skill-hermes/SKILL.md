---
name: taobao-shopcar
description: 在淘宝上将商品加入购物车。当用户说"加入购物车"、"加购"、"帮我把这个加到购物车"、"把这个淘宝商品加购物车"时使用。支持商品页 SKU 选择、数量调整、登录检测、加购确认。
verified: true
last_tested: 2026-05-10
test_product: "https://detail.tmall.com/item.htm?id=846190791238"
---

# 淘宝加入购物车 (Hermes 版)

基于 OpenClaw taobao-shopcar-skill 改编的 Hermes 版本。使用 Playwright+Chrome CDP 操作浏览器。

⚠️ **注意：Hermes 内置 browser 工具可能未配置浏览器后端。以下流程基于 Python Playwright 脚本实现。** 如需通过 Hermes browser 工具使用，需确保浏览器后端已安装（Browserbase/Camofox/本地 Chromium）。

## 实测结论

✅ **skill 可用！** 2026-05-10 以联想 LP25 蓝牙耳机（天猫）实测通过：
- 导航商品页 ✅
- 反检测注入 ✅ 
- SKU 选择 ✅ （云岩白 + 官方标配）
- 点击"加入购物车" ✅
- 购物车数量验证 ✅ （80 → 81）

## 重要规则

1. **必须用 browser.evaluate 注入 JS 脚本操作 DOM**，不要自己写 JS 点击（会被淘宝反爬拦截）
2. **反检测脚本必须注入**，否则淘宝可能返回不完整页面（缺少购买区域）
3. **回复要简洁**，成功/失败一句话，不要解释过程
4. **遇到验证码/登录拦截**，告知用户手动处理，等待最多5分钟

## 前置条件

Hermes 的 `browser` 工具集已启用，且浏览器正常运行（本地 Chrome 或 Browserbase）。

或用 Python Playwright 脚本直接操作：

```bash
pip3 install playwright
python3 -c "
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)  # 非headless模式显示浏览器窗口
    # ... 执行加购流程
"
```

推荐方式：**Chrome CDP 模式**（复用现有浏览器，cookies 已登录）：
```bash
# 1. 启动 Chrome 并开启 CDP
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9223 --no-first-run &

# 2. 连接 CDP 执行操作
python3 -c "
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp('http://127.0.0.1:9223')
    context = browser.contexts[0]
    page = context.new_page()
    # ... 加购流程
"
```

## 参考文件

本 skill 的 references/ 目录下存放了原 OpenClaw 版本的脚本和文档：
- `references/sku-selection.md` — 原版 SKU 规格选择指南
- `references/cart-confirm.md` — 加购后弹窗处理
- `references/stealth-script.md` — 反检测脚本
- `scripts/add_to_cart.sh` — 一键加购 Bash 脚本（OpenClaw 版）
- `scripts/batch_add_to_cart.sh` — 批量加购 Bash 脚本
- `scripts/{select_sku,verify_sku,check_cart,check_blocker,check_rating,extract_product_ids,sort_by_sales}.js` — JS 辅助脚本

## 完整加购流程

### 1. 打开商品页

```python
page.goto("https://detail.tmall.com/item.htm?id=xxx", wait_until="domcontentloaded", timeout=30000)
time.sleep(5)  # 等 JS 渲染
```

### 2. 注入反检测脚本

```javascript
// 通过 page.evaluate() 注入
Object.defineProperty(navigator,"webdriver",{get:()=>false,configurable:true,enumerable:true});
delete window.__playwright__; delete window.__pw_manual__; delete window.__PW_inspect__; delete window._pwChrome;
window.chrome={runtime:{connect:function(){},sendMessage:function(){}},loadTimes:function(){},csi:function(){},app:{isInstalled:false}};
Object.defineProperty(navigator,"plugins",{get:()=>[{filename:"internal-pdf-viewer",name:"Chrome PDF Plugin",description:"Portable Document Format",mimeTypes:[{type:"application/pdf",suffixes:"pdf"}]},{filename:"mhjfbmdgcfjbbpaeojofohoefgiehjai",name:"Chrome PDF Viewer",description:"",mimeTypes:[]},{filename:"internal-nacl-plugin",name:"Native Client",description:"",mimeTypes:[]}],configurable:true,enumerable:true});
Object.defineProperty(navigator,"languages",{get:()=>["zh-CN","zh","en-US","en"],configurable:true,enumerable:true});
Object.defineProperty(navigator,"hardwareConcurrency",{get:()=>8,configurable:true,enumerable:true});
Object.defineProperty(navigator,"deviceMemory",{get:()=>8,configurable:true,enumerable:true});
```

### 3. 检查登录状态

用 body 内容检查是否跳转到登录页：

```python
logged_in = page.evaluate("() => !document.body.innerText.includes('请登录') && !document.location.href.includes('login')")
```

### 4. 选择 SKU 规格（核心难点）

淘宝 SKU 结构（实测 Tmall 天猫）：
- SKU 选项容器：`div[class*=valueItem--]` 
- 分组容器：`skuItem--Z2AJB9Ew`（每个 skuItem 对应一个属性列，如"颜色分类"和"套餐类型"）
- 选中态：通过 `MouseEvent("click", {bubbles:true})` dispatch

**改进版选择脚本**（已实测通过）：

```javascript
function selectSKUs() {
  // 只选顶级容器，排除子元素（如 valueItemImgWrap--, valueItemText--）
  const allItems = document.querySelectorAll("div[class*=valueItem--]");
  const topLevelItems = [];
  for (const item of allItems) {
    const parent = item.parentElement;
    if (parent && parent.className && parent.className.includes('valueItem--')) {
      continue; // 跳过子元素
    }
    topLevelItems.push(item);
  }
  
  if (topLevelItems.length === 0) return { success: false, error: '没有SKU选项' };
  
  // 按 skuItem 祖先分组（Tmall 专用）
  const groups = [];
  let currentGroup = [];
  let lastSkuParent = null;
  
  for (const item of topLevelItems) {
    let skuParent = item.parentElement;
    while (skuParent && !skuParent.className.includes('skuItem')) {
      skuParent = skuParent.parentElement;
    }
    if (skuParent !== lastSkuParent && currentGroup.length > 0) {
      groups.push([...currentGroup]);
      currentGroup = [];
    }
    currentGroup.push(item);
    lastSkuParent = skuParent;
  }
  if (currentGroup.length > 0) groups.push(currentGroup);
  
  const selected = [];
  for (const group of groups) {
    let clicked = false;
    for (const item of group) {
      const cls = item.className || "";
      if (cls.includes("disabled") || cls.includes("grey") || cls.includes("gray")) continue;
      if (item.offsetHeight === 0) continue;
      
      // 跳过"拍下颜色随机"这类默认选项（如果有更好的选择）
      const text = item.textContent?.trim() || '';
      // (可选的优化: 跳过"随机"项)
      
      item.scrollIntoView({ behavior: 'instant', block: 'center' });
      const e = new MouseEvent("click", { bubbles: true, cancelable: true, view: window });
      item.dispatchEvent(e);
      
      selected.push(text.substring(0, 15));
      clicked = true;
      break;
    }
    if (!clicked) return { success: false, error: '第'+(groups.indexOf(group)+1)+'组无可用选项' };
  }
  
  return { success: true, selected };
}
```

### 5. 记录加购前购物车数量

```python
cart_before = page.evaluate("""() => {
    const m = document.body.innerText.match(/购物车\\s*(\\d+)/);
    return m ? parseInt(m[1]) : 0;
}""")
```

### 6. 调整数量（可选）

修改数量输入框的 value 并触发 input/change 事件：

```javascript
const qtyInput = document.querySelector('input[type="number"], input[class*="count"]');
if (qtyInput) {
  qtyInput.value = "3";
  qtyInput.dispatchEvent(new Event("input", { bubbles: true }));
  qtyInput.dispatchEvent(new Event("change", { bubbles: true }));
}
```

### 7. 点击加入购物车

用精确文本匹配找到按钮并点击：

```javascript
// 找所有按钮元素，匹配精确文本"加入购物车"
const allEls = document.querySelectorAll('button, a, span, div, em');
for (const el of allEls) {
  const text = (el.textContent || '').trim().replace(/\\s+/g, '');
  if (text === '加入购物车') {
    el.scrollIntoView();
    el.click();
    break;
  }
}
```

### 8. 验证加购结果

**双重验证**：
1. 检查弹窗文本是否包含"成功加入购物车"或"已加入购物车"
2. 回到淘宝首页，读取购物车数字对比前后变化

```python
# 方法1: 弹窗检查
popup = page.evaluate("() => document.body.innerText.includes('成功加入购物车')")

# 方法2: 购物车数量变化
page.goto("https://www.taobao.com/", wait_until="domcontentloaded")
cart_after = page.evaluate("""() => {
    const m = document.body.innerText.match(/购物车\\s*(\\d+)/);
    return m ? parseInt(m[1]) : 0;
}""")
```

### 9. 处理加购后弹窗

点击后可能出现：
- **成功弹窗**：显示"已成功加入购物车" → 完成 ✅
- **规格未选提示**：提示请选择规格 → 返回步骤 4 补选
- **库存不足**：提示无货 → 告知用户
- **需要登录**：跳转登录页 → 返回步骤 3
- **确认弹窗**：需要再次确认 → 点击确认按钮

### 10. 返回结果

简洁回复，不要废话：
- 成功：`✅ 已加购 联想LP25蓝牙耳机 云岩白 官方标配 ¥110`
- 失败：`❌ 加购失败：未登录/无货/按钮无响应`
- 多个：`✅ 3个成功，2个失败`

## 注意事项（实测经验总结）

### ⚠️ 关键陷阱
1. **`[class*=valueItem--]` 会匹配子元素**（如 `valueItemImgWrap--`、`valueItemText--`），必须检查父元素也包含 `valueItem--` 来过滤
2. **Tmall 的 SKU 分组用 `skuItem--` 容器**，不是直接父容器 `content--`。不同组的 SKU 选项可能是同一个父容器
3. **选中后不一定会出现 `isSelected` class**，Tmall 可能使用其他机制。不用等验证，直接点第一个可用选项
4. **"颜色随机"选项**通常排在第一个，如果还有其他颜色选项可选，优先跳过

### 通用规则
- 加购前必须已登录，否则会跳转登录页
- 部分商品有购买限制（限购数量、会员等级等）
- 预售/定金商品的加购流程可能不同，需要特殊处理
- 操作间隔建议 2 秒以上，避免触发风控
- SKU 组名不固定（颜色分类/套餐类型/尺寸等），不能写死
- 不要一次性点击所有选项，必须逐个选择、逐个等待
- React 状态更新需要时间，每次点击后等 300-500ms
- 有些商品没有 SKU 选项（如统一规格），直接点加购即可
- 图片式 SKU：选项可能是图片+文字，点击逻辑相同
- **body 内容短（<3000字符）通常意味着页面加载不完整**，尝试刷新或重新导航
