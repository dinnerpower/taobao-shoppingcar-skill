#!/bin/bash
# 淘宝加入购物车主脚本 (WSL 优化版)
# 用法: bash scripts/add_to_cart.sh <商品URL或关键词>
#
# WSL 环境特别说明:
# - 浏览器通过 WSLg (DISPLAY=:0) 显示在 Windows 桌面
# - 未登录时会展示登录页，用户可以扫码登录

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INPUT="$1"

if [ -z "$INPUT" ]; then
  echo "用法: bash scripts/add_to_cart.sh <商品URL或搜索关键词>"
  exit 1
fi

# 读取购物车数量
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

# 等待用户手动处理拦截（验证码/登录）
wait_for_unblock() {
  local msg="$1"
  echo "⚠️ $msg"
  echo "请在浏览器窗口中手动完成操作，完成后自动继续（最多等5分钟）"
  for i in $(seq 1 60); do
    sleep 5
    local blocker=$(check_blocker) || true
    if [ -z "$blocker" ]; then
      echo "✅ 已通过验证，继续执行"
      return 0
    fi
  done
  echo "❌ 等待超时，请手动完成后重新运行"
  return 1
}

# 刷新并等待购物车数量加载
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

echo "=== 淘宝加入购物车 ==="

# 判断输入是 URL 还是关键词
if [[ "$INPUT" == http* ]]; then
  PRODUCT_URL="$INPUT"
else
  ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$INPUT'))")
  openclaw browser navigate "https://s.taobao.com/search?q=$ENCODED" 2>&1
  sleep 3

  # 搜索后检测拦截
  BLOCKER=$(check_blocker) || true
  if [ -n "$BLOCKER" ]; then
    wait_for_unblock "$(echo "$BLOCKER" | cut -d'|' -f2)" || exit 1
  fi

  ITEM_ID=$(openclaw browser evaluate --fn "$(cat "$SCRIPT_DIR/extract_first_product_id.js")" 2>&1 | grep -oP '\d{8,}' | head -1)
  if [ -z "$ITEM_ID" ]; then
    echo "❌ 未找到商品"
    exit 1
  fi
  PRODUCT_URL="https://item.taobao.com/item.htm?id=$ITEM_ID"
fi

openclaw browser navigate "$PRODUCT_URL" 2>&1
sleep 3

# 检测拦截
BLOCKER=$(check_blocker) || true
if [ -n "$BLOCKER" ]; then
  TYPE=$(echo "$BLOCKER" | cut -d'|' -f1)
  MSG=$(echo "$BLOCKER" | cut -d'|' -f2)
  echo "⚠️ $MSG"
  echo "请在浏览器中手动完成操作，完成后脚本会继续"
  echo "等待中..."
  wait_for_unblock "$MSG" || exit 1
fi

# 记录加购前购物车数量
CART_BEFORE=$(get_cart_count)
echo "加购前: $CART_BEFORE"

# 选择 SKU（使用改进版脚本，支持子元素过滤和 skuItem 分组）
openclaw browser evaluate --fn "$(cat "$SCRIPT_DIR/select_sku.js")" 2>&1 > /dev/null
sleep 2

# 点击加入购物车
REF=$(openclaw browser snapshot 2>&1 | grep -oP 'button "加入购物车" \[ref=(e\d+)' | head -1 | grep -oP 'e\d+')
if [ -z "$REF" ]; then
  echo "❌ 未找到加入购物车按钮"
  exit 1
fi
openclaw browser click "$REF" 2>&1
sleep 2

# 再次检测拦截
BLOCKER=$(check_blocker) || true
if [ -n "$BLOCKER" ]; then
  wait_for_unblock "$(echo "$BLOCKER" | cut -d'|' -f2)" || exit 1
fi

# 验证加购结果
CART_AFTER=$(reload_and_get_cart)

if [ "$CART_AFTER" -gt "$CART_BEFORE" ] 2>/dev/null; then
  echo "✅ 加购成功 ($CART_BEFORE → $CART_AFTER)"
else
  echo "❌ 加购失败 ($CART_BEFORE → $CART_AFTER)"
fi
