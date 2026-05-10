# SKU 规格选择指南

## 核心原则

**每选一个选项，必须验证选中状态，再选下一个。**

SKU 选项之间有依赖关系：选了"黑色"后，"256GB"可能变灰（无货或不兼容）。不能一次性选完所有选项。

## 第一步：获取所有 SKU 信息

用 evaluate 获取所有 SKU 选项，按父容器自动分组（组名不固定）：

```javascript
const items = document.querySelectorAll("[class*=valueItem--]");
const result = Array.from(items).map((el, i) => ({
  index: i,
  text: el.textContent?.substring(0, 40),
  selected: el.className.includes("isSelected"),
  disabled: el.className.includes("disabled") || el.className.includes("grey") || 
            el.className.includes("gray") || el.offsetHeight === 0,
  parentIndex: // 父元素在所有 SKU 组中的索引
}));
```

按父容器分组：同一个父元素下的选项属于同一个 SKU 组。

## 第二步：逐个选择，逐个验证

### 选择流程

对每个 SKU 组（颜色、容量、版本等）：

1. **找到该组的所有选项**
2. **选第一个可用选项**（非 disabled、非灰色）
3. **等待 300-500ms** 让 React 更新状态
4. **验证是否选中成功**（检查 class 包含 `isSelected`）
5. **检查后续组的选项是否变灰**
6. **如果选中失败或导致冲突，换下一个选项重试**

### 验证选中状态

```javascript
// 点击后验证
const item = items[index];
const isSelected = item.className.includes("isSelected");
```

### 检查选项是否变灰/不可选

```javascript
// 检查某个选项是否可用
function isOptionAvailable(el) {
  const cls = el.className || "";
  const isDisabled = cls.includes("disabled") || cls.includes("grey") || cls.includes("gray");
  const isHidden = el.offsetHeight === 0 || el.offsetWidth === 0;
  const hasStrike = el.querySelector("[class*=strike], [class*=line-through], s, del");
  return !isDisabled && !isHidden && !hasStrike;
}
```

## 第三步：处理不可用选项

### 情况 1：选项无货（灰色/删除线）

- 跳过该选项，选同组下一个可用选项
- 如果同组所有选项都不可用，告知用户"该规格无货"

### 情况 2：选项不兼容（选了 A 导致 B 不可选）

- 这是正常的 SKU 依赖关系
- 选了 A 后，B 变灰 → 换一个 B 的可用选项
- 如果所有 B 都不可用 → 换一个 A 的选项重试

### 情况 3：所有组合都无货

- 告知用户"该商品暂时无货"

## 完整选择脚本

```javascript
function selectSKUs() {
  const items = document.querySelectorAll("[class*=valueItem--]");
  if (items.length === 0) return { success: false, error: "no sku items" };
  
  // 按父容器自动分组（组名不固定）
  const groups = [];
  let currentGroup = [];
  let lastParent = null;
  
  for (const item of items) {
    const parent = item.parentElement;
    if (parent !== lastParent && currentGroup.length > 0) {
      groups.push([...currentGroup]);
      currentGroup = [];
    }
    currentGroup.push(item);
    lastParent = parent;
  }
  if (currentGroup.length > 0) groups.push(currentGroup);
  
  const selected = [];
  
  // 逐组选择
  for (const group of groups) {
    let clicked = false;
    for (const item of group) {
      const cls = item.className || "";
      const isDisabled = cls.includes("disabled") || cls.includes("grey") || cls.includes("gray");
      const isHidden = item.offsetHeight === 0;
      if (isDisabled || isHidden) continue;
      
      const e = new MouseEvent("click", { bubbles: true, cancelable: true, view: window });
      item.dispatchEvent(e);
      
      // 验证选中（需要在外部等待 300ms 后再检查）
      if (item.className.includes("isSelected")) {
        selected.push(item.textContent?.substring(0, 20));
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      return { success: false, error: "no available option in this group" };
    }
  }
  
  return { success: true, selected };
}
```

## 注意事项

- **SKU 组名不固定**，不能写死“颜色”“容量”等名称，必须通过父容器自动分组
- **不要一次性点击所有选项**，必须逐个验证
- **React 状态更新需要时间**，每次点击后等 300-500ms
- **class 名可能变化**，用 `includes("isSelected")` 而不是精确匹配
- **有些商品没有 SKU 选项**（如统一规格），直接点加购即可
- **图片式 SKU**：选项可能是图片+文字，点击逻辑相同
