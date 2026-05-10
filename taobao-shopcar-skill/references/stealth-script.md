# 反检测脚本

和 taobao-search 共用同一套反检测代码。

## 注入方式

```bash
openclaw browser evaluate --fn 'function(){
Object.defineProperty(navigator,"webdriver",{get:()=>false,configurable:true,enumerable:true});
delete window.__playwright__;delete window.__pw_manual__;delete window.__PW_inspect__;delete window._pwChrome;
window.chrome={runtime:{connect:function(){},sendMessage:function(){}},loadTimes:function(){},csi:function(){},app:{isInstalled:false}};
Object.defineProperty(navigator,"plugins",{get:()=>[{filename:"internal-pdf-viewer",name:"Chrome PDF Plugin",description:"Portable Document Format",mimeTypes:[{type:"application/pdf",suffixes:"pdf"}]},{filename:"mhjfbmdgcfjbbpaeojofohoefgiehjai",name:"Chrome PDF Viewer",description:"",mimeTypes:[]},{filename:"internal-nacl-plugin",name:"Native Client",description:"",mimeTypes:[]}],configurable:true,enumerable:true});
Object.defineProperty(navigator,"languages",{get:()=>["zh-CN","zh","en-US","en"],configurable:true,enumerable:true});
Object.defineProperty(navigator,"hardwareConcurrency",{get:()=>8,configurable:true,enumerable:true});
Object.defineProperty(navigator,"deviceMemory",{get:()=>8,configurable:true,enumerable:true});
}'
```

## 详细脚本

完整的反检测 JS 见 taobao-search 技能的 [references/stealth-script.md](../../taobao-search/references/stealth-script.md)。
