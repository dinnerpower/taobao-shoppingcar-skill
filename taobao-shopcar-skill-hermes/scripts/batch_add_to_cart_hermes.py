#!/usr/bin/env python3
"""
淘宝批量加购 - Hermes/Playwright 版 v6
全流程可观测：每一步截图 + 页面状态诊断
"""
import json, time, sys, os, subprocess, re, urllib.parse, urllib.request
from playwright.sync_api import sync_playwright

CDP_PORT, CDP_URL = 9223, f"http://127.0.0.1:9223"
CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
USER_DATA_DIR = os.path.expanduser("~/.hermes/chrome-taobao")
KEYWORD = sys.argv[1] if len(sys.argv) > 1 else "蓝牙耳机"
TARGET_COUNT = int(sys.argv[2]) if len(sys.argv) > 2 else 5
MIN_RATING = float(sys.argv[3]) if len(sys.argv) > 3 else 95.0
SEARCH_URL = f"https://s.taobao.com/search?q={urllib.parse.quote(KEYWORD)}"
DEBUG_DIR = "/tmp/taobao_debug"

def ensure_chrome():
    try:
        json.loads(urllib.request.urlopen(f"{CDP_URL}/json/version", timeout=3).read())
        print(f"✅ Chrome CDP OK"); return True
    except: pass
    print(f"🚀 启动 Chrome")
    os.makedirs(USER_DATA_DIR, exist_ok=True)
    subprocess.run(["pkill", "-f", f"remote-debugging-port={CDP_PORT}"], capture_output=True)
    time.sleep(1)
    subprocess.Popen([CHROME_PATH, f"--remote-debugging-port={CDP_PORT}",
        "--no-first-run", "--no-default-browser-check", f"--user-data-dir={USER_DATA_DIR}"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(15):
        time.sleep(1)
        try:
            json.loads(urllib.request.urlopen(f"{CDP_URL}/json/version", timeout=2).read())
            print(f"✅ Chrome 已就绪"); return True
        except: pass
    print("❌ Chrome启动失败"); return False

def inject_stealth(page):
    page.evaluate("""Object.defineProperty(navigator,"webdriver",{get:()=>false,configurable:true,enumerable:true});
    delete window.__playwright__;delete window.__pw_manual__;delete window.__PW_inspect__;delete window._pwChrome;
    window.chrome={runtime:{connect:function(){},sendMessage:function(){}},loadTimes:function(){},csi:function(){},app:{isInstalled:false}};
    Object.defineProperty(navigator,"plugins",{get:()=>[{filename:"internal-pdf-viewer",name:"Chrome PDF Plugin",description:"Portable Document Format",mimeTypes:[{type:"application/pdf",suffixes:"pdf"}]},{filename:"mhjfbmdgcfjbbpaeojofohoefgiehjai",name:"Chrome PDF Viewer",description:"",mimeTypes:[]},{filename:"internal-nacl-plugin",name:"Native Client",description:"",mimeTypes:[]}],configurable:true,enumerable:true});
    Object.defineProperty(navigator,"languages",{get:()=>["zh-CN","zh","en-US","en"],configurable:true,enumerable:true});""")

def extract_products(page):
    return page.evaluate("""()=>{
        const p=[];const s=new Set();
        for(const l of document.querySelectorAll('a')){
            const h=l.href||'',m=h.match(/id=(\\d{8,})/);
            if(!m||s.has(m[1])||(!h.includes('item.htm')&&!h.includes('detail.tmall')))continue;
            s.add(m[1]);const t=l.textContent||'';
            const te=l.querySelector('[class*="title" i]');
            const title=te?te.textContent.trim().substring(0,60):t.substring(0,60);
            const pe=l.querySelector('[class*="price" i]');let price='',sales='';
            if(pe){const pt=pe.textContent.trim();
                const pm=pt.match(/[¥￥]\\s*[\\d.]+/);if(pm)price=pm[0];
                const sm=pt.match(/(\\d+[\\.\\d]*万?\\+?人[付购买][款买]?)/);if(sm)sales=sm[1];}
            if(!sales){const sm=t.match(/(\\d+[\\.\\d]*(?:万|千)?\\s*[+＋]?\\s*人[付购买][款买]?)/);if(sm)sales=sm[1];}
            p.push({id:m[1],title,price,sales});
        }
        return{count:p.length,products:p.slice(0,30)};
    }""")

def parse_sales(t):
    if not t: return 0
    n = re.search(r'(\d+(?:\.\d+)?)', t)
    if not n: return 0
    v = float(n.group(1))
    if '万' in t: v *= 10000
    return int(v)

def find_rating(page):
    result = page.evaluate("""() => {
        const body = document.body.innerText || '';
        let m = body.match(/好评率[\\s:：]*(\\d+\\.?\\d*)%/);
        if (m) return {found:true, rating:parseFloat(m[1]), method:'好评率_全文'};
        m = body.match(/好\\s*评\\s*率[\\s:：]*(\\d+\\.?\\d*)%/);
        if (m) return {found:true, rating:parseFloat(m[1]), method:'好评率_含空格'};
        m = body.match(/好评[\\s:：]*(\\d+\\.?\\d*)%/);
        if (m) return {found:true, rating:parseFloat(m[1]), method:'好评_全文'};
        const dsrScores = [];
        const dsrMatches = body.matchAll(/(描述|服务|物流|宝贝)[\\s:：]*(4\\.\\d)/g);
        for (const dm of dsrMatches) dsrScores.push(parseFloat(dm[2]));
        if (dsrScores.length >= 2) {
            const avg = dsrScores.reduce((a,b)=>a+b,0) / dsrScores.length;
            const est = Math.round(100 - (5 - avg) * 30);
            if (est >= 85) return {found:true, rating:Math.min(99,est), method:'DSR估算', detail:avg.toFixed(2)};
        }
        m = body.match(/评分[\\s:：]*(4\\.\\d)/);
        if (m) { const s=parseFloat(m[1]); const e=Math.round(100-(5-s)*30); if(e>=85) return {found:true,rating:Math.min(99,e),method:'评分估算'}; }
        const walker = document.createTreeWalker(document.body, 4, null, false); let node;
        while (node = walker.nextNode()) {
            const t = node.textContent || '';
            if ((t.includes('好评率')||(t.includes('好评')&&t.includes('%'))) && t.length<80) {
                let mm = t.match(/(\\d+\\.?\\d*)\\s*%/);
                if (mm && parseFloat(mm[1])>=50) return {found:true, rating:parseFloat(mm[1]), method:'DOM递归'};
            }
        }
        return {found:false};
    }""")
    if result.get('found'): return result
    
    print("   📜 找评价tab...")
    page.evaluate("""()=>{
        for(const tab of document.querySelectorAll('[class*="tab" i],[role="tab"],[class*="Tab" i]')){
            const t=tab.textContent||'';
            if(t.includes('评价')){tab.click();return;}
        }
        for(const el of document.querySelectorAll('[class*="rate" i],[class*="Rate" i],[class*="review" i]')){
            if(el.querySelector('a,button,[class*="tab"]')){el.click();return;}
        }
    }""")
    time.sleep(3)
    after = page.evaluate("""()=>{const b=document.body.innerText||'';
        let m=b.match(/好评率[\\s:：]*(\\d+\\.?\\d*)%/);if(m)return{found:true,rating:parseFloat(m[1]),method:'tab后'};
        m=b.match(/好评[\\s:：]*(\\d+\\.?\\d*)%/);if(m)return{found:true,rating:parseFloat(m[1]),method:'tab后2'};
        return{found:false};}""")
    if after.get('found'): return after
    
    print("   📜 分步滚动...")
    for sp in [1500,3000,4500,6000,8000]:
        page.evaluate(f"window.scrollTo(0,{sp})"); time.sleep(1.5)
        ck = page.evaluate("""()=>{const b=document.body.innerText||'';
            let m=b.match(/好评率[\\s:：]*(\\d+\\.?\\d*)%/);if(m)return{found:true,rating:parseFloat(m[1]),method:'滚动'+window.scrollY};
            m=b.match(/好评[\\s:：]*(\\d+\\.?\\d*)%/);if(m)return{found:true,rating:parseFloat(m[1]),method:'滚动'+window.scrollY};
            return{found:false};}""")
        if ck.get('found'): page.evaluate("scrollTo(0,0)"); return ck
    page.evaluate("scrollTo(0,0)")
    return {'found': False}

def diagnose_page(page, label=""):
    """全页面诊断：截图+状态报告，方便我观察问题"""
    os.makedirs(DEBUG_DIR, exist_ok=True)
    ts = int(time.time())
    page.screenshot(path=f"{DEBUG_DIR}/{ts}_{label}.png")
    
    return page.evaluate(f"""() => {{
        const body = document.body.innerText || '';
        const results = {{}};
        
        // 1. 购物车按钮诊断
        const allEls = document.querySelectorAll('button,a,span,div,em');
        results.cartBtns = [];
        for (const el of allEls) {{
            const t = (el.textContent||'').trim().replace(/\\s+/g,'');
            if (t.includes('加入购物车') || t.includes('加购')) {{
                const rect = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                results.cartBtns.push({{
                    text: t.substring(0,20),
                    tag: el.tagName,
                    visible: rect.width > 0 && rect.height > 0,
                    disabled: el.disabled || el.classList.contains('disabled'),
                    pointerEvents: style.pointerEvents,
                    opacity: style.opacity,
                    zIndex: style.zIndex,
                    rect: `${{Math.round(rect.left)}},${{Math.round(rect.top)}} ${{Math.round(rect.width)}}x${{Math.round(rect.height)}}`,
                    above: document.elementFromPoint(rect.left+5, rect.top+5)?.tagName || '?'
                }});
            }}
        }}
        
        // 2. 是否有弹窗覆盖
        const overlays = document.querySelectorAll('[class*="overlay" i],[class*="modal" i],[class*="dialog" i],[class*="popup" i]');
        results.overlays = [];
        for (const ov of overlays) {{
            const rect = ov.getBoundingClientRect();
            if (rect.width > 100 && rect.height > 50 && rect.top < 500) {{
                results.overlays.push({{
                    class: ov.className.substring(0,40),
                    text: (ov.textContent||'').substring(0,60),
                    rect: `${{Math.round(rect.width)}}x${{Math.round(rect.height)}}`
                }});
            }}
        }}
        
        // 3. SKU选中状态
        const skuItems = document.querySelectorAll('div[class*="valueItem--"]');
        let skuSelected = 0, skuTotal = 0;
        for (const item of skuItems) {{
            if (item.className.includes('valueItem--') && 
                !item.className.includes('valueItemImg') && !item.className.includes('valueItemText')) {{
                skuTotal++;
                if (item.className.includes('selected') || item.className.includes('active')) skuSelected++;
            }}
        }}
        results.sku = {{total: skuTotal, selected: skuSelected}};
        
        // 4. 页面关键文本
        results.hasLogin = body.includes('请登录') || body.includes('登录');
        results.hasError = body.includes('不存在') || body.includes('下架') || body.includes('错误');
        results.hasCaptcha = body.includes('验证') || body.includes('captcha');
        results.hasStockout = body.includes('库存不足') || body.includes('缺货') || body.includes('已售罄');
        results.hasCartSuccess = body.includes('成功加入购物车') || body.includes('已加入购物车');
        results.cartNavCount = (body.match(/购物车\\s*(\\d+)/) || [])[1] || '?';
        results.bodyLen = body.length;
        results.url = document.location.href.substring(0,80);
        
        return results;
    }}""")

def select_sku(page):
    return page.evaluate("""()=>{
        const all=document.querySelectorAll("div[class*=valueItem--]");
        const top=[];
        for(const item of all){
            const p=item.parentElement;
            if(p&&p.className&&p.className.includes('valueItem--'))continue;
            top.push(item);
        }
        if(top.length===0)return{success:true,note:'无SKU'};
        const g=[];let cur=[],ls=null;
        for(const item of top){
            let sp=item.parentElement;
            while(sp&&!sp.className.includes('skuItem'))sp=sp.parentElement;
            if(sp!==ls&&cur.length>0){g.push([...cur]);cur=[];}
            cur.push(item);ls=sp;
        }
        if(cur.length>0)g.push(cur);
        const sel=[];
        for(const gr of g){
            let ok=false;
            for(const item of gr){
                const cls=item.className||"";
                if(cls.includes("disabled")||cls.includes("grey")||cls.includes("gray"))continue;
                if(item.offsetHeight===0)continue;
                const txt=item.textContent?.trim()||'';
                if(g.indexOf(gr)===0&&gr.length>1&&(txt.includes('随机')||txt.includes('官方正品')))continue;
                item.scrollIntoView({behavior:'instant',block:'center'});
                item.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true,view:window}));
                sel.push(txt.substring(0,15));ok=true;break;
            }
            if(!ok)return{success:false,error:'g'+g.indexOf(gr)};
        }
        return{success:true,selected:sel};
    }""")

def add_to_cart_v2(page):
    """
    加购v2：诊断式点击，失败时报告原因
    返回 {success, method, diagnosis}
    """
    return page.evaluate("""() => {
        const result = { success: false, attempts: [] };
        const allEls = document.querySelectorAll('button,a,span,div,em');
        
        let bestBtn = null;
        for (const el of allEls) {
            const t = (el.textContent||'').trim().replace(/\\s+/g,'');
            if (t === '加入购物车' || t === '加入購物車') {
                const rect = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                const isDisabled = el.disabled || style.pointerEvents === 'none' || style.opacity < 0.5;
                result.attempts.push({ method: 'text_match', tag: el.tagName, disabled: isDisabled, rect: Math.round(rect.width)+'x'+Math.round(rect.height) });
                
                if (!isDisabled && rect.width > 0) {
                    bestBtn = el;
                    break;
                }
            }
        }
        
        if (!bestBtn && result.attempts.length > 0) {
            // 按钮存在但disabled，尝试忽略状态强制点击
            for (const el of allEls) {
                const t = (el.textContent||'').trim().replace(/\\s+/g,'');
                if (t === '加入购物车') {
                    bestBtn = el;
                    result.attempts.push({ method: 'force_click' });
                    break;
                }
            }
        }
        
        if (!bestBtn) {
            // 完全没找到 → 看是不是用其他文字
            for (const el of allEls) {
                const t = (el.textContent||'').trim().replace(/\\s+/g,'');
                if (t.includes('加入购') || t.includes('加购') || 
                    (t.includes('购') && t.includes('车')) ||
                    t === '立即购买' || t === '立即搶購') {
                    result.attempts.push({ method: 'fuzzy', text: t.substring(0,15) });
                }
            }
            result.diagnosis = 'no_cart_btn_found';
            return result;
        }
        
        bestBtn.scrollIntoView({behavior:'instant',block:'center'});
        bestBtn.dispatchEvent(new MouseEvent("click", {bubbles:true,cancelable:true,view:window}));
        result.success = true;
        result.method = 'clicked';
        return result;
    }""")

def cart_count(page):
    return page.evaluate("""()=>{const m=document.body.innerText.match(/购物车\\s*(\\d+)/);return m?parseInt(m[1]):0;}""")

def main():
    print(f"\n{'='*55}")
    print(f"  批量加购 v6: {KEYWORD} × {TARGET_COUNT}个 (≥{MIN_RATING}%)")
    print(f"  DEBUG截图: {DEBUG_DIR}/")
    print(f"{'='*55}")
    
    if not ensure_chrome(): return
    os.makedirs(DEBUG_DIR, exist_ok=True)
    
    with sync_playwright() as p:
        browser = p.chromium.connect_over_cdp(CDP_URL)
        ctx = browser.contexts[0] if browser.contexts else browser.new_context(
            locale="zh-CN", timezone_id="Asia/Shanghai", viewport={"width":1920,"height":1080})
        page = ctx.new_page()
        
        print(f"\n[1] 搜索「{KEYWORD}」")
        page.goto(SEARCH_URL, wait_until="domcontentloaded", timeout=30000)
        time.sleep(5); inject_stealth(page)
        
        print(f"[2] 提取商品...")
        r = extract_products(page); prods = r.get('products',[])
        print(f"   找到 {len(prods)} 个")
        
        goods=[]; s0=0
        for pr in prods:
            sn=parse_sales(pr.get('sales',''))
            if sn>0: goods.append(pr)
            else: s0+=1
        print(f"   有销量:{len(goods)}, 零销量:{s0}")
        if not goods: print("❌ 无有销量商品"); return
        
        print(f"[3] 筛选加购...")
        added, failed, no_r, low_r = 0, 0, 0, 0
        items = []
        
        for idx, pr in enumerate(goods):
            if added >= TARGET_COUNT: break
            pid = pr['id']; title = pr.get('title','')[:45]
            print(f"\n[{idx+1}/{len(goods)}] {title}")
            
            page.goto(f"https://detail.tmall.com/item.htm?id={pid}", wait_until="domcontentloaded", timeout=30000)
            time.sleep(5); inject_stealth(page)
            if "error" in page.url:
                page.goto(f"https://item.taobao.com/item.htm?id={pid}", wait_until="domcontentloaded", timeout=30000)
                time.sleep(5); inject_stealth(page)
                if "error" in page.url: print(f"   ❌ 不存在"); failed+=1; continue
            if "login" in page.url: print(f"   ⚠️ 需登录"); failed+=1; continue
            
            rating = find_rating(page)
            if not rating.get('found'): print(f"   ⛔ 无好评率"); no_r+=1; continue
            rv = rating['rating']; mtd = rating.get('method','?')
            print(f"   好评率: {rv}% ({mtd})")
            if rv < MIN_RATING: print(f"   ⛔ <{MIN_RATING}%"); low_r+=1; continue
            
            print(f"   ✅ 达标→加购")
            
            # === 全诊断加购流程 ===
            cb = cart_count(page)
            print(f"   购物车前: {cb}")
            
            # 选SKU
            sku_ok = select_sku(page)
            print(f"   SKU: {json.dumps(sku_ok, ensure_ascii=False)[:80]}")
            time.sleep(1.5)
            
            # 诊断式点击加购
            diag = diagnose_page(page, f"before_click_{idx+1}")
            btn_count = len(diag.get('cartBtns', []))
            has_overlay = len(diag.get('overlays', [])) > 0
            sku_state = diag.get('sku', {})
            
            if btn_count == 0:
                print(f"   ❌ 页面上没有「加入购物车」按钮")
                print(f"     SKU状态: {sku_state}")
                print(f"     弹窗: {diag.get('overlays',[])[:1]}")
                failed += 1
                continue
            
            if has_overlay:
                print(f"   ⚠️ 有弹窗遮挡: {diag['overlays'][0]['text'][:40]}")
            
            btn_info = diag['cartBtns'][0]
            print(f"   按钮: {btn_info.get('tag','?')} rect={btn_info.get('rect','?')} disabled={btn_info.get('disabled','?')}")
            
            # 点击
            click_result = add_to_cart_v2(page)
            print(f"   点击: {json.dumps(click_result, ensure_ascii=False)[:100]}")
            time.sleep(3)
            
            # 诊断点击后
            diag_after = diagnose_page(page, f"after_click_{idx+1}")
            ca = cart_count(page)
            has_success = diag_after.get('hasCartSuccess', False)
            
            print(f"   购物车后: {ca} | 弹窗成功: {has_success}")
            
            if ca > cb:
                added += 1; items.append(f"{title[:30]}({rv}%)")
                print(f"   ✅ #{added}")
            elif has_success:
                added += 1; items.append(f"{title[:30]}({rv}%)")
                print(f"   ✅ #{added} (弹窗确认)")
            else:
                # 刷新后再试
                print(f"   🤔 刷新验证...")
                page.reload(wait_until="domcontentloaded"); time.sleep(4)
                ca2 = cart_count(page)
                if ca2 > cb:
                    added += 1; items.append(f"{title[:30]}({rv}%)")
                    print(f"   ✅ #{added} (刷新确认)")
                else:
                    # 完整诊断报告
                    print(f"   ❌ 失败诊断:")
                    print(f"     SKU: {diag.get('sku',{})}")
                    print(f"     按钮: {diag.get('cartBtns',[])[:1]}")
                    print(f"     弹窗: {diag.get('overlays',[])[:1]}")
                    print(f"     已登录: {not diag.get('hasLogin',True)}")
                    print(f"     库存不足: {diag.get('hasStockout','?')}")
                    print(f"     body长度: {diag.get('bodyLen','?')}")
                    failed += 1
        
        print(f"\n{'='*55}")
        print(f"  完成! ✅ {added} | ❌ {failed} | 无好评率{no_r} | <{MIN_RATING}% {low_r}")
        for it in items: print(f"   ✔ {it}")
        print(f"{'='*55}")
        print(f"📸 诊断截图: {DEBUG_DIR}/")
        page.close()

if __name__ == "__main__":
    main()
