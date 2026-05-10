# taobao-shopcar-skill

淘宝商品加入购物车技能（WSL 优化版），支持单个加购、批量加购、好评率筛选。

## 功能

- 单个商品加购
- 批量加购（综合排序，非仅销量）
- 按好评率筛选（跳过低分商品）
- 自动过滤零销量商品
- 自动选择 SKU 规格
- 加购前后对比购物车数量验证
- 滑块验证码/登录检测（自动等待用户处理）

## 环境要求

- OpenClaw（浏览器插件已启用）
- Chromium：`sudo snap install chromium`
- 中文字体：`sudo apt-get install -y fonts-wqy-zenhei fonts-wqy-microhei`
- WSLg（Windows 桌面显示浏览器窗口）
- 淘宝已登录（首次需手动在浏览器中登录）

## 使用

### 自然语言调用（推荐）

直接说：

```
把好评率大于99%的索尼耳机加到购物车
添加好评率大于95%的索尼耳机到购物车
帮我加购5个好评率98%以上的索尼耳机
```

### 命令行调用

```bash
cd ~/.openclaw/plugin-skills/taobao-shopcar-skill

# 单个加购
bash scripts/add_to_cart.sh "https://detail.tmall.com/item.htm?id=xxx"

# 批量加购（搜索关键词，目标数量，最低好评率）
bash scripts/batch_add_to_cart.sh "蓝牙耳机" 5 96
```

### 批量加购参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| 搜索关键词 | 必填 | 无默认 |
| 数量 | 目标加购件数 | 5 |
| 最低好评率 | 筛选阈值（%） | 0（不筛选） |

## 文件结构

```
taobao-shopcar-skill/
├── SKILL.md                        # 技能指引
├── README.md                       # 本文件
├── references/
│   ├── stealth-script.md           # 反检测 JS
│   ├── sku-selection.md            # SKU 选择逻辑
│   └── cart-confirm.md             # 弹窗处理
└── scripts/
    ├── add_to_cart.sh              # 单个加购
    ├── batch_add_to_cart.sh        # 批量加购（好评率筛选）
    ├── check_blocker.js            # 验证码/登录检测
    ├── select_sku.js               # SKU 自动选择
    ├── verify_sku.js               # SKU 验证
    ├── check_cart.js               # 购物车数量检查
    └── extract_product_ids.js      # 提取商品列表
```
