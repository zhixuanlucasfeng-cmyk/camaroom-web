# 统一网站 restarsolar.net 设计文档

- 日期：2026-09-14
- 状态：设计已逐段确认，待审阅书面文档
- 范围：子项目 1（统一网站）+ 子项目 2（旧网站跳转）

## 1. 背景与目标

目前有 4 个国家站点：喀麦隆（camaroom-web）、Mali、Nigeria、Sudan。后三个由
`scripts/generate_country_site.py` 从喀麦隆的 `index.html` 用正则替换生成，分别放在各自的 GitHub Pages 仓库。

**目标**：只保留一个网站 `restarsolar.net`（域名已在 Cloudflare 购买）。国家相关内容改为**运行时**根据客户所选国家切换，不再在生成时写死。以后新增国家只需要加一条配置。

**已确认的决定**

| 问题 | 决定 |
|---|---|
| 客户何时选国家 | IP 自动识别 + 页头可切换，下单/联系处显示当前国家 |
| 托管 | Cloudflare Pages（代码仍在 camaroom-web 仓库） |
| 旧网站 | 跳转到 restarsolar.net 并预选对应国家 |
| 不在列表中的国家 | 「其他国家」选项，联系中国销售 Tom Yang，走 WhatsApp 询价 |
| 实现方式 | 方案 A：单页面 + 国家配置表（否决：按路径生成多份页面、框架重写） |

## 2. 架构

```
浏览器 ──> Cloudflare Pages (restarsolar.net)
            ├─ index.html / 404.html / assets/…      静态文件
            ├─ assets/js/countries.js                 国家配置表 + 国家判断逻辑
            └─ functions/api/geo.js                   返回 {country: request.cf.country}
        ──> 购物车 Worker（按国家选择）
            ├─ CM: camaroom-cart-backend.zhixuanlucasfeng.workers.dev
            └─ ML: camaroom-cart-backend-mali.zhixuanlucasfeng.workers.dev
        ──> AI 客服后端 rest-solar-agent.onrender.com（RS_COUNTRY 随国家变化）
```

购物车 Worker 与 AI 后端的 CORS 均为 `*`，更换域名无需改动（2026-09-14 已核实）。

### 2.1 国家配置表 `assets/js/countries.js`

数据全部迁移自 `generate_country_site.py` 与现有 `index.html`，不新增任何未经确认的号码或地址。

| 字段 | CM 喀麦隆 | ML Mali | NG Nigeria | SD Sudan | OTHER 其他国家 |
|---|---|---|---|---|---|
| 默认语言 | en | fr | en | ar | en |
| 货币 | XAF | XOF | NGN | SDG | — |
| 门店地址 | Rue Léman, Douala, Cameroon | Sis à l'immeuble à Sotuba Rond-Point, près de Shell, Bamako, Mali | RESTAR SOLAR ENERGY NIGERIA CO LTD, No 22 Olojo Drive, by Church Bus Stop, Ojo - Alaba International Market Road, Ojo Town, Ojo LGA, Lagos State, Nigeria | 无（显示国家名） | 无 |
| 联系人（按显示顺序） | Luc Su +237 681 105 611；Tom Yang +86 187 0773 7002 | Elena +86 158 5149 6160（本地销售由轮流分配接口动态提供） | Bright +234 906 361 2011；James +234 916 110 1749 | Zhang Gang +86 188 2518 7185（副号 +249 91 534 8323，不可点击） | Tom Yang +86 187 0773 7002 |
| 页头/页脚电话 | Tom Yang | Elena | James | Zhang Gang | Tom Yang |
| 购物车后端 | CM Worker | ML Worker | 无 | 无 | 无 |
| 销售轮流分配 | 沿用现有逻辑 | 沿用现有逻辑（已配置 5 人名单） | 无后端，不调用 | 无后端，不调用 | 无后端，不调用 |
| 转人工 | 后端 `CM` | 后端 `ML` | 后端 `NG` | 后端 `SD` | 无，改为打开 Tom Yang 的 WhatsApp |

「购物车后端为无」即不能在线下单。

### 2.2 国家判断优先级

`resolveCountry()` 为纯函数，按以下顺序取第一个有效值：

1. 网址参数 `?country=xx`（不区分大小写；有效时同时写入浏览器存储）
2. 浏览器存储中客户上次的选择（`localStorage` 键 `rs_country`，读写均包 try/catch）
3. IP 识别：首次访问请求 `/api/geo`，超时 1.5 秒；结果在 CM/ML/NG/SD 中则采用
4. 以上均无效 → `OTHER`

无效代码（如 `?country=zz`）直接跳过，进入下一级。

首次访问、等待 `/api/geo` 返回期间，页面先按 `OTHER` 渲染联系区（位于页面底部，首屏看不到切换）。

### 2.3 切换国家时的更新（`applyCountry(code)`）

一个函数负责全部更新，页面加载和手动切换都调用它：

- 联系区：标题「🇲🇱 Mali 的联系方式」，联系人行与 WhatsApp 大按钮由配置生成（替代目前写死的 Luc Su / Tom Yang 区块）；地址行
- `CONFIG.whatsapp` / `CONFIG.phone`（页头信息栏、页脚、询价表单的 WhatsApp 目标）
- `window.CART_ENABLED`、`CART_API_BASE`、`CART_CURRENCY`、`CART_WHATSAPP_NUMBER`；购物车按钮显示/隐藏；重新拉取 `/api/inventory`
- 有购物车后端的国家：调用该后端的 `/api/sales-rep`，返回销售时覆盖默认联系人；请求失败或没有返回时保留配置表中的联系人（沿用现有逻辑，不改变行为）
- 聊天组件：`RS_COUNTRY`、`AGENT_PHONE`、`AGENT_LABEL`、`AGENT_PHONE_2`（及"Send to X"按钮）
- 首次访问（无存储、无网址参数）时按国家设置默认语言；之后以客户手动选择的语言为准

现有 `index.html` 中直接读取这些全局变量的代码，改为在 `applyCountry` 之后读取，或者在切换时重新渲染。

## 3. 界面

1. **切换器**：页头信息栏右侧、语言按钮旁，原生 `<select>`，显示「🇲🇱 Mali」，选项为 5 个国家。
2. **首次访问提示条**：「正在显示 🇲🇱 Mali 的联系方式与下单服务 · 更改 · ×」。不遮挡内容；点「更改」聚焦切换器；点 × 或手动选过国家后不再出现（存储键 `rs_country_banner_dismissed`）。
3. **当前国家确认**（不弹窗）：
   - 联系区标题带国家
   - 购物车提交表单顶部：「收货国家：🇲🇱 Mali（更改）」
   - 转人工提示：「正在为您连接 Mali 团队…」
4. **不能在线下单的国家**（NG / SD / OTHER）：隐藏购物车；产品卡上的「加入购物车」替换为「WhatsApp 询价」，打开该国主联系人的 WhatsApp，并预填产品名称。
5. **切换国家且购物车非空**：页面内确认框「切换到 Nigeria 会清空购物车（3 件商品），确定吗？」。取消则切换器恢复原值；确认则 `Cart.clear()` 后切换。不使用 `window.confirm`。
6. **其他国家**：只显示 Tom Yang，无地址行，无购物车；聊天中的「转人工」改为打开 Tom Yang 的 WhatsApp。
7. 新增文案都补齐 en / fr / ar 三种语言；阿拉伯语保持从右到左排版。

## 4. Mali 收款号码（上线前必须处理）

`backend/wrangler.mali.toml` 中的 `MOMO_TRANSFER_NUMBER` / `MOMO_ACCOUNT_NAME` 仍是喀麦隆 MTN 的临时值，询价页 `src/quote.js` 会把它显示给客户。

- 修改 Worker：当 `MOMO_TRANSFER_NUMBER` 为空时，付款说明改为「我们的团队会通过 WhatsApp 发送付款方式」，不显示任何号码。
- 在拿到 Mali 真实的 Orange Money / Moov Money 号码和户名之前，Mali Worker 的这两个变量设为空并重新部署。

## 5. 旧网站跳转

| 旧网址 | 跳转到 |
|---|---|
| zhixuanlucasfeng-cmyk.github.io/Mali-website | restarsolar.net/?country=ml |
| zhixuanlucasfeng-cmyk.github.io/Nigeria-website | restarsolar.net/?country=ng |
| zhixuanlucasfeng-cmyk.github.io/Sudan-website | restarsolar.net/?country=sd |
| zhixuanlucasfeng-cmyk.github.io/camaroom-web | restarsolar.net/?country=cm |
| www.restarsolar.net | restarsolar.net（Cloudflare 重定向规则） |

- Mali / Nigeria / Sudan 仓库：`index.html` 与 `404.html` 替换为跳转页（`<meta http-equiv="refresh">` + `location.replace`，保留 `#锚点`，页面上附带手动链接）。仓库保留不删除。
- camaroom-web：同一份代码同时发布在 GitHub Pages 和 Cloudflare Pages，因此在页面最前面加判断：`location.hostname` 以 `github.io` 结尾时跳转到 `restarsolar.net/?country=cm`（保留锚点）。
- Mali 仓库尚未合并的 `worktree-favicon-r` 分支（logo 恢复 + favicon）不再合并；logo 与 favicon 的修改在统一网站中完成（页头使用 Restarsolar 文字 logo，R 字母作为 favicon）。

## 6. 删除

上线并完成跳转后：删除 `scripts/generate_country_site.py`（及其测试，如果有）。

## 7. 测试

**自动测试**（`node --test`，无需新增依赖；`countries.js` 末尾以 `if (typeof module !== 'undefined') module.exports = …` 导出，浏览器中仍挂到 `window`）：
- `resolveCountry`：网址参数 > 存储 > IP > OTHER；无效代码跳过；存储读取抛异常；`/api/geo` 超时或失败
- 配置表完整性：每个国家都有联系人、默认语言；有购物车后端的国家必须有货币；所有电话号码均为纯数字

**浏览器实测**（本地 + Cloudflare 预览网址）：
- 5 个国家逐个切换：联系人、地址、页头电话、WhatsApp 链接、购物车显示、库存加载、聊天 `RS_COUNTRY`
- 购物车非空时切换：确认框出现，取消/确认行为正确
- NG / SD / OTHER：「WhatsApp 询价」按钮打开正确的号码并预填产品名
- 首次访问提示条出现、关闭后不再出现；`?country=` 参数生效
- Sudan 阿拉伯语从右到左排版；手机宽度 400px
- 4 个旧网址跳转后选中的国家正确，锚点保留

## 8. 上线步骤

每一步验证通过后再进行下一步：

1. 在 camaroom-web 分支 `unified-restarsolar-net` 开发，自动测试与本地浏览器测试通过
2. 用户运行 `npx wrangler login`；部署到 Cloudflare Pages 预览网址，用户用手机和电脑检查
3. 用户确认后，绑定 `restarsolar.net` 与 `www` 跳转，在正式域名上重新测试
4. **再次征得用户同意后**，把 4 个旧网站改为跳转页
5. 删除生成脚本，Mali / Nigeria / Sudan 仓库标记为已停用

## 9. 需要用户提供

- Mali 的 Orange Money / Moov Money 收款号码与户名（不提供也能上线，只是 Mali 付款说明改走 WhatsApp）
- 运行 `npx wrangler login` 登录 Cloudflare

## 10. 不在本次范围（后续子项目 3）

- AI 客服知识库按国家回答（展厅地址、联系人）；聊天请求携带国家代码
- 转人工修复：推送 rest-solar-agent 的 5 个未推送提交，配置 `REDIS_URL`
- 后端新增国际客户国家代码，让「其他国家」也能转人工
- Render 休眠导致首次回复慢（进站唤醒 / 定时唤醒）
