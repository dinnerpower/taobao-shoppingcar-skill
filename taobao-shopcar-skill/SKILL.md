---
name: taobao-shopcar-skill
description: 在淘宝上将商品加入购物车。当用户说"加入购物车"、"加购"、"帮我把这个加到购物车"、"把这个淘宝商品加购物车"时使用。支持商品页 SKU 选择、数量调整、登录检测、加购确认。
---

# 淘宝加入购物车

 **WSL (Windows Subsystem for Linux)** 专用版本。使用 OpenClaw 内置 `browser` 工具操作 Chromium 浏览器。

⚠️ **WSL 环境特殊性：** Linux 没有原生显示器，通过 **WSLg**（Windows 原生的 GUI 支持）在 Windows 桌面上显示浏览器窗口，用户可以扫码登录。

## 实测结论

✅ **skill 可用！** 2026-05-10 以倍思 MP1 降噪蓝牙耳机（天猫）实测通过：
- WSLg 浏览器窗口显示 ✅
- 导航商品页 ✅
- SKU 选择 ✅
- 点击"加入购物车" ✅
- 购物车数量验证 ✅（0 → 1）

## 重要规则

1. **必须用 `openclaw browser evaluate --fn '$(cat scripts/xxx.js)'` 注入 JS 脚本操作 DOM**，不要自己手写 JS 点击（会被淘宝反爬拦截）
2. **反检测脚本必须注入**（见 references/stealth-script.md），否则淘宝可能返回不完整页面
3. **回复要简洁**，成功/失败一句话，不要解释过程
4. **遇到验证码/登录拦截**，告知用户在 WSLg 浏览器窗口中手动处理，等待最多5分钟

## ⚠️ 关键陷阱（实测经验）

1. **`[class*=valueItem--]` 会匹配子元素**（如 `valueItemImgWrap--`、`valueItemText--`），必须检查父元素也包含 `valueItem--` 来过滤
2. **Tmall 的 SKU 分组用 `skuItem--` 容器**，不是直接父容器。不同组的 SKU 选项可能是同一个父容器，必须按 skuItem 祖先分组
3. **选中后不一定会出现 `isSelected` class**，Tmall 可能使用其他机制。不用等验证，直接点第一个可用选项
4. **"颜色随机"选项**通常排在第一个，如果还有其他颜色选项可选，优先跳过
5. **body 内容短（<3000字符）通常意味着页面加载不完整**，尝试刷新或重新导航

## 环境准备

### 1. 确认 WSLg 可用

```bash
ls /mnt/wslg/runtime-dir/wayland-0
```

如果 WSLg 正常，会显示 wayland-0 文件。WSLg 提供 X11 显示器（`/tmp/.X11-unix/X0`）。

### 2. 确认浏览器已安装

```bash
openclaw browser doctor
snap list chromium
```

如果未安装 Chromium：

```bash
sudo snap install chromium
```

### 3. 安装中文字体（WSL 环境必须，否则中文显示为方块）

```bash
sudo apt-get install -y fonts-wqy-zenhei fonts-wqy-microhei
```

### 4. 启动浏览器（WSLg 窗口模式）

```bash
# 停止 headless 模式（如果有）
openclaw browser stop

# 用 WSLg 显示启动（有窗口，可以扫码登录）
DISPLAY=:0 XDG_RUNTIME_DIR=/mnt/wslg/runtime-dir /snap/bin/chromium \
  --no-first-run \
  --no-default-browser-check \
  --disable-sync \
  --disable-background-networking \
  --remote-debugging-port=18800 \
  --user-data-dir=/home/nt/.openclaw/browser/openclaw/user-data \
  --noerrdialogs \
  --start-maximized \
  > /tmp/chrome_wslg.log 2>&1 &
```

浏览器窗口会出现在 Windows 桌面上，可以扫码或密码登录淘宝。

### 5. 验证连接

```bash
openclaw browser status
# 应该显示 running: true, headless: false
```

## 脚本使用

### 一键加购（推荐）

```bash
cd ~/.openclaw/plugin-skills/taobao-shopcar-skill
bash scripts/add_to_cart.sh "https://detail.tmall.com/item.htm?id=xxx"
# 或搜索关键词
bash scripts/add_to_cart.sh "索尼耳机"
```

如果未登录，脚本会自动等待，用户在 WSLg 浏览器窗口中登录即可。

### 单独调用

```bash
# 选择 SKU（改进版，支持子元素过滤 + skuItem 分组）
openclaw browser evaluate --fn "$(cat scripts/select_sku.js)"

# 验证 SKU 选择
openclaw browser evaluate --fn "$(cat scripts/verify_sku.js)"

# 检查购物车数量
openclaw browser evaluate --fn "$(cat scripts/check_cart.js)"
```

## 手动流程

如果脚本执行失败，按以下步骤手动操作：

### 1. 打开商品页

```bash
openclaw browser navigate "https://detail.tmall.com/item.htm?id=xxx"
```

商品 URL 格式：
- `https://item.taobao.com/item.htm?id=xxx`
- `https://detail.tmall.com/item.htm?id=xxx`

### 2. 注入反检测脚本

```bash
openclaw browser evaluate --fn 'function(){
Object.defineProperty(navigator,"webdriver",{get:()=>false,configurable:true,enumerable:true});
delete window.__playwright__;delete window.__pw_manual__;delete window.__PW_inspect__;delete window._pwChrome;
window.chrome={runtime:{connect:function(){},sendMessage:function(){}},loadTimes:function(){},csi:function(){},app:{isInstalled:false}};
Object.defineProperty(navigator,"plugins",{get:()=>[...],configurable:true,enumerable:true});
Object.defineProperty(navigator,"languages",{get:()=>["zh-CN","zh","en-US","en"],configurable:true,enumerable:true});
}'
```

完整脚本见 [references/stealth-script.md](references/stealth-script.md)。

### 3. 检查登录状态

```bash
openclaw browser evaluate --fn 'function(){
  const text = document.body.innerText;
  return {
    loggedIn: !document.location.href.includes("login") && !text.includes("请登录"),
    url: document.location.href.substring(0, 80)
  };
}'
```

**需要登录时：** 浏览器窗口（WSLg）应该已经显示在 Windows 桌面上，引导用户扫码或密码登录。登录后重试。

### 4. 选择 SKU 规格

淘宝商品通常有 SKU 规格选项。**SKU 组名和数量不固定，选项之间有依赖关系，必须逐个选择、逐个验证。**

详细逻辑见 [references/sku-selection.md](references/sku-selection.md)。

**核心流程**（使用改进版 select_sku.js）：

1. 用 `document.querySelectorAll("div[class*=valueItem--]")` 获取所有 SKU 选项
2. **过滤子元素**：检查父元素也包含 `valueItem--` 的子项跳过
3. **按 skuItem 祖先分组**（Tmall 专用），回退到父容器分组
4. 第一组（通常是颜色）有多个选项时跳过"随机"/"官方正品"
5. 用 `scrollIntoView + dispatchEvent(new MouseEvent("click"))` 点击
6. 所有 SKU 选好后，再点"加入购物车"

**使用脚本**：

```bash
openclaw browser evaluate --fn "$(cat scripts/select_sku.js)"
```

### 5. 记录加购前购物车数量

```bash
openclaw browser evaluate --fn "$(cat scripts/check_cart.js)"
```

### 6. 调整数量（可选）

如果用户指定了数量，找到数量输入框并修改：

```bash
openclaw browser fill --fields '[{"ref":"<数量ref>","value":"<数量>"}]'
```

或点击 `+` 按钮：

```bash
openclaw browser click <加号ref>
```

### 7. 点击加入购物车

```bash
REF=$(openclaw browser snapshot 2>&1 | grep -oP 'button "加入购物车" \[ref=(e\d+)' | head -1 | grep -oP 'e\d+')
openclaw browser click "$REF"
```

### 8. 验证加购结果

**双重验证**：
1. 检查弹窗是否包含"成功加入购物车"
2. 回到淘宝首页，对比购物车数字前后变化

```bash
openclaw browser navigate "https://www.taobao.com"
sleep 2
openclaw browser evaluate --fn "$(cat scripts/check_cart.js)"
```

### 9. 处理加购后弹窗

点击后可能出现：
- **成功弹窗**：显示"已成功加入购物车" → 完成 ✅
- **规格未选提示**：提示请选择规格 → 返回步骤 4 补选
- **库存不足**：提示无货 → 告知用户
- **需要登录**：跳转登录页 → 引导用户在 WSLg 窗口中登录
- **确认弹窗**：需要再次确认 → 点击确认按钮

### 10. 返回结果

简洁回复，不要废话：
- 成功：`✅ 已加购 倍思MP1降噪蓝牙耳机 星原钛 官方标配 ¥231`
- 失败：`❌ 加购失败：未登录/无货/按钮无响应`
- 多个：`✅ 3个成功，2个失败`

## 批量加购（综合排序 + 销量过滤 + 好评率检查）

### 一键批量加购

```bash
cd ~/.openclaw/plugin-skills/taobao-shopcar-skill
bash scripts/batch_add_to_cart.sh "蓝牙耳机" 5 95
```

### 流程

1. 搜索商品（综合排序，不按销量）
2. 提取商品列表（含销量信息）
3. 过滤：销量为 0 的直接排除
4. 逐个打开商品详情页 → 检查好评率 → 无好评率/低于阈值跳过
5. 有好评率的 → 选 SKU（改进版脚本）→ 加购
6. 汇总报告

## 注意事项（通用 + WSL 特有）

### WSL 特有
- **WSLg 窗口模式**：启动时要用 `DISPLAY=:0 XDG_RUNTIME_DIR=/mnt/wslg/runtime-dir`，否则只能在 headless 模式运行
- **登录**：用户扫码登录时，浏览器窗口必须在 Windows 桌面上可见。如果 headless 模式，需要截屏给用户看二维码
- **浏览器持久化**：`--user-data-dir` 目录会保存登录态 cookies，登录一次下次复用
- **Chromium snap 限制**：snap 版 chromium 不能直接调用二进制，必须通过 `/snap/bin/chromium` 启动

### 通用
- 加购前必须已登录，否则会跳转登录页
- 部分商品有购买限制（限购数量、会员等级等）
- 预售/定金商品的加购流程可能不同，需要特殊处理
- 操作间隔建议 2 秒以上，避免触发风控
- SKU 组名不固定（颜色分类/套餐类型/尺寸等），不能写死
- 不要一次性点击所有选项，必须逐个选择、逐个等待
- React 状态更新需要时间，每次点击后等 300-500ms
- 有些商品没有 SKU 选项（如统一规格），直接点加购即可
- 图片式 SKU：选项可能是图片+文字，点击逻辑相同
