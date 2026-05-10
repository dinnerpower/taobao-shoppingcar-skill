#!/bin/bash
# 淘宝批量加入购物车（综合排序 + 销量过滤 + 好评率检查 + 阈值筛选）
# 用法: bash scripts/batch_add_to_cart.sh <搜索关键词> [数量] [最低好评率]
# 示例: bash scripts/batch_add_to_cart.sh "蓝牙耳机" 5 98
#
# 流程:
# 1. 搜索商品（综合排序，不按销量）
# 2. 提取商品列表（含销量信息）
# 3. 排除销量为0的商品
# 4. 逐个打开商品详情 → 检查好评率 → 低于阈值或无好评率跳过
# 5. 选 SKU → 加购 → 汇总

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
KEYWORD="$1"
COUNT="${2:-5}"
MIN_RATING="${3:-0}"

if [ -z "$KEYWORD" ]; then
  echo "用法: bash scripts/batch_add_to_cart.sh <搜索关键词> [数量] [最低好评率]"
  echo "示例: bash scripts/batch_add_to_cart.sh \"蓝牙耳机\" 5 98"
  exit 1
fi

# 读取购物车数量的函数
get_cart_count() {
  openclaw browser evaluate --fn "$(cat "$SCRIPT_DIR/check_cart.js")" 2>&1 | tr -d '\n' | grep -oP '"count":\s*\d+' | grep -oP '\d+'
}

# 检测验证码/登录拦截
check_blocker() {
  local result=$(openclaw browser evaluate --fn "$(cat "$SCRIPT_DIR/check_blocker.js")" 2>&1 | tr -d '\n')
  local blocked=$(echo "$result" | grep -oP '"blocked":\s*\w+' | grep -oP '\w+$')
  local type=$(echo "$result" | grep -oP '"type":\s*"\w+"' | grep -oP '"\w+"' | tr -d '"')
  local msg=$(echo "$result" | grep -oP '"message":\s*"[^"]*"' | sed 's/"message":\s*"//' | sed 's/"$//')
  if [ "$blocked" = "true" ]; then
    echo "$type|$msg"
    return 1
  fi
  return 0
}

# 等待用户手动处理拦截
wait_for_unblock() {
  local msg="$1"
  echo "⚠️ $msg"
  echo "请在浏览器中手动完成，完成后自动继续（最多等5分钟）"
  for i in $(seq 1 60); do
    sleep 5
    local blocker=$(check_blocker) || true
    if [ -z "$blocker" ]; then
      echo "✅ 已通过，继续"
      return 0
    fi
  done
  echo "❌ 等待超时，跳过"
  return 1
}

# 刷新并等待购物车数量加载的函数
reload_and_get_cart() {
  openclaw browser evaluate --fn 'function(){location.reload()}' 2>&1 > /dev/null
  local count=""
  for i in $(seq 1 10); do
    sleep 1
    count=$(get_cart_count)
    if [ -n "$count" ] && [ "$count" != "null" ]; then
      echo "$count"
      return
    fi
  done
  echo "0"
}

# 解析销量文字为数字（处理 "1万+" "1000+" "100" 等格式）
parse_sales() {
  local text="$1"
  if [ -z "$text" ]; then
    echo "0"
    return
  fi
  # 提取数字部分
  local num=$(echo "$text" | grep -oP '[\d.]+' | head -1)
  if [ -z "$num" ]; then
    echo "0"
    return
  fi
  # 处理 "万" 单位
  if echo "$text" | grep -q "万"; then
    echo "$num * 10000" | bc 2>/dev/null || echo "$num * 10000" | awk '{print int($1 * 10000)}'
  else
    echo "$num" | awk '{print int($1)}'
  fi
}

# 检查好评率
check_rating() {
  local result=$(openclaw browser evaluate --fn "$(cat "$SCRIPT_DIR/check_rating.js")" 2>&1 | tr -d '\n')
  local found=$(echo "$result" | grep -oP '"found":\s*\w+' | grep -oP '\w+$')
  local rating=$(echo "$result" | grep -oP '"rating":\s*[\d.]+' | grep -oP '[\d.]+')
  if [ "$found" = "true" ] && [ -n "$rating" ]; then
    echo "$rating"
    return 0
  fi
  return 1
}

echo "=== 淘宝批量加购 ==="
echo "搜索关键词: $KEYWORD"
echo "目标数量: $COUNT"
[ "$MIN_RATING" != "0" ] && echo "最低好评率: ${MIN_RATING}%"
echo ""

# 1. 搜索商品（综合排序，不按销量）
echo "[1/4] 搜索商品"
ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$KEYWORD'))")
openclaw browser navigate "https://s.taobao.com/search?q=$ENCODED" 2>&1
sleep 3

# 搜索后检测拦截
BLOCKER=$(check_blocker) || true
if [ -n "$BLOCKER" ]; then
  wait_for_unblock "$(echo "$BLOCKER" | cut -d'|' -f2)" || exit 1
fi

# 2. 提取商品列表（含销量信息）
echo "[2/4] 提取商品列表"
RESULT=$(openclaw browser evaluate --fn "$(cat "$SCRIPT_DIR/extract_product_ids.js")" 2>&1)

# 提取完整商品信息到临时文件
RAW_FILE=$(mktemp)
echo "$RESULT" > "$RAW_FILE"

# 解析商品：提取 id, title, sales
# 输出格式: id|title|sales_text
python3 -c "
import json, sys, re
raw = open('$RAW_FILE').read()
# 提取 JSON 对象
start = raw.find('{')
if start == -1:
    sys.exit(0)
try:
    data = json.loads(raw[start:])
except:
    sys.exit(0)
products = data.get('products', [])
for p in products:
    pid = p.get('id', '')
    title = p.get('title', '')[:80]
    sales = p.get('sales', '')
    if pid:
        print(f'{pid}|{title}|{sales}')
" > /tmp/taobao_products.txt

rm -f "$RAW_FILE"

# 3. 过滤：排除销量为0的商品
echo "[2/4] 过滤零销量商品..."
FILTERED_FILE=$(mktemp)
SKIPPED_SALES=0
while IFS='|' read -r PID PTITLE PSALES; do
  SALES_NUM=$(parse_sales "$PSALES")
  if [ "$SALES_NUM" -gt 0 ] 2>/dev/null; then
    echo "$PID|$PTITLE|$PSALES|$SALES_NUM" >> "$FILTERED_FILE"
  else
    echo "   ⛔ 跳过（销量=0）: $PTITLE"
    SKIPPED_SALES=$((SKIPPED_SALES + 1))
  fi
done < /tmp/taobao_products.txt

TOTAL_FOUND=$(wc -l < /tmp/taobao_products.txt)
PASSED_SALES=$(wc -l < "$FILTERED_FILE")
echo "   商品总数: $TOTAL_FOUND, 有销量: $PASSED_SALES, 已跳过: $SKIPPED_SALES"

if [ "$PASSED_SALES" -eq 0 ]; then
  echo "❌ 没有有销量的商品"
  rm -f "$FILTERED_FILE" /tmp/taobao_products.txt
  exit 0
fi

# 限制数量
head -"$COUNT" "$FILTERED_FILE" > "${FILTERED_FILE}.top"
mv "${FILTERED_FILE}.top" "$FILTERED_FILE"

TOTAL=$(wc -l < "$FILTERED_FILE")
echo ""
echo "将检查以下商品的好评率:"
while IFS='|' read -r PID PTITLE PSALES PSALES_NUM; do
  echo "   - $PTITLE [销量:$PSALES]"
done < "$FILTERED_FILE"
echo ""

# 4. 逐个检查好评率并加购
SUCCESS=0
FAILED=0
SKIPPED_RATING=0
SKIPPED_LOW_RATING=0
INDEX=0

echo "[3/4] 检查好评率并加购"
while IFS='|' read -r PID PTITLE PSALES PSALES_NUM; do
  INDEX=$((INDEX + 1))
  echo ""
  echo "--- [$INDEX/$TOTAL] $PTITLE ---"

  # 打开商品页
  PRODUCT_URL="https://item.taobao.com/item.htm?id=$PID"
  openclaw browser navigate "$PRODUCT_URL" 2>&1
  sleep 5

  # 检测拦截
  BLOCKER=$(check_blocker) || true
  if [ -n "$BLOCKER" ]; then
    if ! wait_for_unblock "$(echo "$BLOCKER" | cut -d'|' -f2)"; then
      FAILED=$((FAILED + 1))
      continue
    fi
  fi

  # ★ 检查好评率
  RATING=$(check_rating) || true
  if [ -z "$RATING" ]; then
    echo "   ⛔ 跳过（无好评率信息）"
    SKIPPED_RATING=$((SKIPPED_RATING + 1))
    continue
  fi
  echo "   好评率: ${RATING}%"

  # ★ 好评率阈值检查
  if [ -n "$MIN_RATING" ] && [ "$MIN_RATING" != "0" ]; then
    ABOVE=$(python3 -c "print(1 if float($RATING) >= float($MIN_RATING) else 0)")
    if [ "$ABOVE" = "0" ]; then
      echo "   ⛔ 跳过（好评率 ${RATING}% < ${MIN_RATING}%）"
      SKIPPED_LOW_RATING=$((SKIPPED_LOW_RATING + 1))
      continue
    fi
  fi

  # 检查是否有加入购物车按钮
  HAS_CART_BTN=$(openclaw browser snapshot 2>&1 | grep -c "加入购物车" || true)
  if [ "$HAS_CART_BTN" -eq 0 ]; then
    echo "   ❌ 无加入购物车按钮，跳过"
    FAILED=$((FAILED + 1))
    continue
  fi

  # 记录加购前数量
  CART_BEFORE=$(get_cart_count)
  echo "   加购前购物车: $CART_BEFORE"

  # 选择 SKU（改进版，支持子元素过滤和 skuItem 分组）
  SELECT_RESULT=$(openclaw browser evaluate --fn "$(cat "$SCRIPT_DIR/select_sku.js")" 2>&1)
  echo "   SKU选择完成"
  sleep 2

  # 点击加入购物车
  REF=$(openclaw browser snapshot 2>&1 | grep -oP 'button "加入购物车" \[ref=(e\d+)' | head -1 | grep -oP 'e\d+')
  if [ -z "$REF" ]; then
    echo "   ❌ 未找到按钮，跳过"
    FAILED=$((FAILED + 1))
    continue
  fi
  openclaw browser click "$REF" 2>&1
  sleep 2

  # 检测拦截
  BLOCKER=$(check_blocker) || true
  if [ -n "$BLOCKER" ]; then
    if ! wait_for_unblock "$(echo "$BLOCKER" | cut -d'|' -f2)"; then
      FAILED=$((FAILED + 1))
      continue
    fi
  fi

  # 刷新页面并等待购物车数量加载
  CART_AFTER=$(reload_and_get_cart)

  if [ "$CART_AFTER" -gt "$CART_BEFORE" ] 2>/dev/null; then
    echo "   ✅ 加购成功 ($CART_BEFORE → $CART_AFTER)"
    SUCCESS=$((SUCCESS + 1))
  else
    echo "   ❌ 加购失败 ($CART_BEFORE → $CART_AFTER)"
    FAILED=$((FAILED + 1))
  fi

  # 返回搜索结果页准备下一个
  if [ "$INDEX" -lt "$TOTAL" ]; then
    openclaw browser navigate "https://s.taobao.com/search?q=$ENCODED&tab=all" 2>&1
    sleep 3
    # 返回搜索页后检测拦截
    BLOCKER=$(check_blocker) || true
    if [ -n "$BLOCKER" ]; then
      wait_for_unblock "$(echo "$BLOCKER" | cut -d'|' -f2)" || true
    fi
  fi
done < "$FILTERED_FILE"

# 清理临时文件
rm -f "$FILTERED_FILE" /tmp/taobao_products.txt

# 5. 输出汇总
echo ""
echo "[4/4] 汇总"
echo "=============================="
echo "✅ 加购成功: $SUCCESS"
echo "❌ 加购失败: $FAILED"
echo "⛔ 跳过（无好评率）: $SKIPPED_RATING"
[ "$SKIPPED_LOW_RATING" -gt 0 ] && echo "⛔ 跳过（好评率不达标）: $SKIPPED_LOW_RATING"
echo "⛔ 跳过（零销量）: $SKIPPED_SALES"
echo "📊 检查商品数: $TOTAL"
echo "=============================="
