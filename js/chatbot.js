// Lavish Lavender AI Assistant — Hybrid Intelligence System (Local + Gemini 1.5)
(function () {

    const BOT_NAME = "Lily";
    // CRITICAL: Move this to a backend proxy (e.g., Firebase Cloud Function or Cloudflare Worker)
    const GEMINI_URL = "https://little-violet-7bc7.lavishlavenderin.workers.dev";

    const COMMANDS = [
        { patterns: ['add item', 'new item', 'create item', 'add product', 'add inventory', 'save to inventory'], action: 'addItem' },
        { patterns: ['add to cart', 'to cart', 'to card', 'add to card', 'add to bill', 'sell ', 'cart', 'card'], action: 'addToCart' },
        { patterns: ['how many', 'stock of', 'stock check', 'check stock', 'availability'], action: 'checkStock' },
        { patterns: ['total sales', 'sales today', 'today sales', 'today sale', "today's revenue", 'upi sale', 'cash sale'], action: 'salesToday' },
        { patterns: ['total expenses', 'expenses today', 'today expenses', 'spending'], action: 'expensesToday' },
        { patterns: ['pending dues', 'outstanding', 'receivables', 'who owes', 'balance due'], action: 'pendingDues' },
        { patterns: ['new order', 'create order', 'tailoring order', 'book order'], action: 'newOrder' },
        { patterns: ['overdue', 'late orders', 'expired orders'], action: 'overdueOrders' },
        { patterns: ['urgent', 'due soon', 'upcoming delivery'], action: 'urgentOrders' },
        { patterns: ['find client', 'search client', 'lookup client', 'client info', 'customer info'], action: 'findClient' },
        { patterns: ['loyalty points', 'points of', 'check points', 'how many points'], action: 'checkLoyalty' },
        { patterns: ['low stock', 'out of stock', 'stock alert', 'reorder'], action: 'lowStock' },
        { patterns: ['top selling', 'best seller', 'popular items', 'top products'], action: 'topSelling' },
        { patterns: ['add expense', 'record expense', 'log expense'], action: 'addExpense' },
        { patterns: ['bill count', 'how many bills', 'total bills', 'invoice count'], action: 'billCount' },
        { patterns: ['profit', 'margin', 'net profit'], action: 'profitToday' },
        { patterns: ['view cart', 'show cart', 'what is in cart', 'cart items'], action: 'viewCart' },
        { patterns: ['clear cart', 'empty cart', 'remove all from cart'], action: 'clearCart' },
        { patterns: ['help', 'what can you do', 'commands', 'guide'], action: 'help' },
        { patterns: ['hi', 'hello', 'hey', 'good morning', 'good evening'], action: 'greet' },
        { patterns: ['add '], action: 'ambiguousAdd' }
    ];

    // Performance: Pre-compiled Regex objects for input cleaning
    const CLEANER_REGEXES = (() => {
        const cleaners = [
            'add item', 'new item', 'create item', 'add product', 'add to cart', 'add to card', 'add to bill', 'add to', 'to cart', 'to card', 'in cart', 'in card',
            'stock of', 'check stock', 'stock check', 'how many', 'sell', 'named', 'called', 'name', 'availability', 'item', 'product', 'add', 'points of', 'points'
        ];
        return cleaners.sort((a, b) => b.length - a.length).map(c => {
            const escaped = c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return new RegExp('\\b' + escaped + '\\b', 'gi');
        });
    })();

    // Intelligence: Contextual Buffer
    let _chatHistory = [];

    // === UTILITIES ===

    function getTodayTimestamp() {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    }

    function toTimestamp(val) {
        if (!val) return 0;
        if (typeof val === 'number') return val;
        if (val.toMillis) return val.toMillis();
        if (val.toDate) return val.toDate().getTime();
        if (val instanceof Date) return val.getTime();
        const d = new Date(val);
        const ts = d.getTime();
        if (isNaN(ts)) { console.warn(`[Lily Parser] Failed to parse: ${val}`); return 0; }
        return ts;
    }

    function esc(s) {
        if (!s) return "";
        return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;").replace(/`/g, "&#096;");
    }

    // === PARSERS ===

    function parseAmount(text) {
        const match = text.match(/(?:₹|rs\.?|rupees?)\s*(\d[\d,]*\.?\d*)/i) || text.match(/(\d[\d,]*\.?\d*)\s*(?:₹|rs|rupees?)/i) || text.match(/(?:at|for|price)\s+(\d[\d,]*\.?\d*)/i);
        return match && match[1] ? parseFloat(match[1].replace(/,/g, '')) : null;
    }

    function parseItemName(text) {
        let cleaned = text.toLowerCase();
        CLEANER_REGEXES.forEach(rx => { cleaned = cleaned.replace(rx, ''); });
        cleaned = cleaned.replace(/\b(?:at|for|price)\s+(?:₹|rs\.?|rupees?)?\s*\d[\d,]*\.?\d*\b/gi, '');
        cleaned = cleaned.replace(/\b(?:₹|rs\.?|rupees?)\s*\d[\d,]*\.?\d*\b/gi, '');
        cleaned = cleaned.replace(/^(a |an |the |some )/i, '').replace(/[^\w\s\d]/g, '').replace(/\s+/g, ' ').trim();
        return cleaned;
    }

    function getLocalIntent(text) {
        const lower = text.toLowerCase().trim();
        let bestMatch = null, bestLength = 0;
        for (const cmd of COMMANDS) {
            for (const pattern of cmd.patterns) {
                if (lower.includes(pattern) && pattern.length > bestLength) {
                    bestMatch = cmd.action;
                    bestLength = pattern.length;
                }
            }
        }
        return bestMatch;
    }

    // === DATA CONTEXT ===

    function buildAIContext() {
        const state = window.erpState;
        if (!state) return "Data unavailable.";
        const now = Date.now(), todayTs = getTodayTimestamp();
        const todaySales = (state.sales || []).filter(s => toTimestamp(s.date || s.createdAt) >= todayTs);
        const todayExpenses = (state.expenses || []).filter(e => toTimestamp(e.date || e.createdAt) >= todayTs);
        const activeOrders = (state.orders || []).filter(o => o.status !== 'Delivered');
        const overdueOrders = activeOrders.filter(o => o.deliveryDate && toTimestamp(o.deliveryDate) < now);
        const totalRevenue = todaySales.reduce((s, x) => s + (x.total || 0), 0);
        const totalExpenses = todayExpenses.reduce((s, e) => s + (e.amount || 0), 0);
        const totalDues = (state.sales || []).reduce((s, x) => s + (x.balanceDue || 0), 0) + (state.orders || []).reduce((s, o) => s + Math.max(0, (o.totalCost || 0) - (o.advancePaid || 0) - (o.deliveryDiscount || 0)), 0);
        const itemSummary = (state.items || []).slice(0, 15).map(i => `${i.name} (${i.sku}): ${i.stock} in stock, ₹${i.sellingPrice}`).join('\n');
        const historyContext = _chatHistory.slice(-8).map(m => `${m.role === 'user' ? 'User' : 'Lily'}: ${m.text}`).join('\n');
        return `TODAY: ${new Date().toLocaleDateString()}\nREVENUE: ₹${totalRevenue.toLocaleString()}\nEXPENSES: ₹${totalExpenses.toLocaleString()}\nDUES: ₹${totalDues.toLocaleString()}\nACTIVE ORDERS: ${activeOrders.length} tours (${overdueOrders.length} overdue)\n\nCONVERSATION:\n${historyContext}\n\nINVENTORY:\n${itemSummary}`;
    }

    // === AI CORE ===

    function extractAction(text) {
        const cleaned = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '');
        const candidates = cleaned.match(/\{[\s\S]*?"action"[\s\S]*?\}/g);
        if (!candidates) return null;
        for (const candidate of candidates) {
            try {
                let depth = 0, start = -1, end = -1;
                for (let i = 0; i < candidate.length; i++) {
                    if (candidate[i] === '{') { if (depth === 0) start = i; depth++; }
                    if (candidate[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
                }
                if (start !== -1 && end !== -1) {
                    const parsed = JSON.parse(candidate.substring(start, end));
                    if (parsed.action && parsed.params) return parsed;
                }
            } catch (e) { continue; }
        }
        return null;
    }

    async function callGemini(userPrompt) {
        try {
            const res = await fetch(GEMINI_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: `You are Lily, the intelligent AI assistant for "Lavish Lavender Bridal Boutique". Tone: Helpful, professional. Output: Use Markdown. Use JSON actions: {"action": "name", "params": {...}} if needed.\n\nBUSINESS STATE:\n${buildAIContext()}\n\nUSER REQUEST: ${userPrompt}` }]
                    }],
                    generationConfig: { temperature: 0.2, maxOutputTokens: 1024 }
                })
            });
            
            if (!res.ok) {
                const errBody = await res.text().catch(() => '');
                console.error(`[Lily] Worker returned ${res.status}: ${errBody}`);
                if (res.status === 403) return { text: `⚠️ **AI Worker Blocked (403)**. The Cloudflare Worker proxy is rejecting requests. Please check:\n• The Gemini API key inside the Worker is valid\n• The Worker has no domain restrictions blocking this site` };
                if (res.status === 429) return { text: `⚠️ **Rate Limited (429)**. Too many requests. Please wait a moment and try again.` };
                return { text: `⚠️ **Worker Error (${res.status})**. The AI backend returned an error. Details: ${errBody.substring(0, 100) || 'No details'}` };
            }
            
            const data = await res.json();
            let responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Lily is temporarily unavailable.';
            const action = extractAction(responseText);
            let actionResult = null;
            if (action) {
                actionResult = await executeGeminiAction(action.action, action.params);
                responseText = responseText.replace(/\{[\s\S]*?"action"[\s\S]*?\}/g, '').trim();
            }
            return { text: responseText, actionResult };
        } catch (e) { 
            console.error('[Lily] Fetch failed:', e);
            return { text: `⚠️ **Connection Error**: I couldn't reach my AI brain. I'm operating in **Local Mode** right now. You can still ask me about sales, stock, and orders!` }; 
        }
    }


    async function executeGeminiAction(action, params) {
        const state = window.erpState, FB = window.FB;
        if (!FB || !state) return { success: false, message: "System state not initialized." };
        try {
            switch (action) {
                case 'addItem':
                    const existingSkus = new Set((state.items || []).map(i => i.sku));
                    let skuNum = (state.items || []).length + 1001, sku; do { sku = "LL" + skuNum.toString().padStart(5, "0"); skuNum++; } while (existingSkus.has(sku));
                    await FB.collection('items').add({ name: params.name || 'New Item', category: params.category || 'General', soldBy: 'pcs', stock: parseFloat(params.stock || 0), sellingPrice: parseFloat(params.price || 0), costPrice: 0, sku, barcode: sku, timestamp: Date.now() });
                    return { success: true, message: `Created **${esc(params.name)}** in catalog (SKU: ${sku}).`, type: 'inventory' };
                case 'addToCart':
                    const q = (params.name_or_sku || params.name || '').toLowerCase();
                    const item = (state.items || []).find(i => (i.name && i.name.toLowerCase().includes(q)) || (i.sku && i.sku.toLowerCase() === q));
                    if (item && window.addCart) { window.addCart(item.id); return { success: true, message: `Added **${esc(item.name)}** to cart.`, type: 'cart' }; }
                    return { success: false, message: `Not found: "${esc(q)}"` };
                case 'addExpense':
                    await FB.collection('expenses').add({ date: Date.now(), category: params.category || 'General', amount: parseFloat(params.amount || 0), description: params.description || 'Logged via Lily AI', paymentMethod: 'Cash', paymentBreakdown: { cash: parseFloat(params.amount || 0), upi: 0 }, createdAt: Date.now() });
                    return { success: true, message: `Logged expense: **₹${params.amount}** for ${esc(params.category)}.`, type: 'expense' };
                case 'openOrder': if (window.openOrderModal) { window.openOrderModal(); return { success: true, message: "Opening order form...", type: 'system' }; } return null;
                case 'showAnalytics': if (window.setDashFilter) { window.setDashFilter('today'); return { success: true, message: `Opening today's analytics.`, type: 'analytics' }; } return null;
                default: return null;
            }
        } catch (e) { return { success: false, message: `Execution Error: ${e.message}` }; }
    }

    // === LOCAL HANDLERS ===

    async function executeLocal(intent, text) {
        const state = window.erpState, fmt = window.fmt || ((v) => '₹' + (v || 0).toLocaleString('en-IN')), todayTs = getTodayTimestamp();
        if (!state && intent !== 'help' && intent !== 'greet') return { text: "Connecting to business core..." };
        switch (intent) {
            case 'greet': return { text: "Good day! I'm **Lily**, your AI assistant. 🌸 How may I assist you?" };
            case 'help': return { text: `**Fast Commands:**\n• "Sales today"\n• "Stock of Saree"\n• "Overdue orders"\n• "Add expense ₹500 for Tea"\n• "Sell SKU"\n\nI can also answer complex business queries via Gemini AI. ✨` };
            case 'salesToday': {
                const sales = (state.sales || []).filter(s => toTimestamp(s.date || s.createdAt) >= todayTs);
                const total = sales.reduce((s, x) => s + (x.total || 0), 0);
                const cash = sales.reduce((s, x) => s + (x.paymentBreakdown?.cash || 0), 0), upi = sales.reduce((s, x) => s + (x.paymentBreakdown?.upi || 0), 0);
                let res = `📊 **Today's Revenue: ${fmt(total)}** (${sales.length} bills).`;
                if (text.toLowerCase().includes('upi')) res = `📱 **UPI Sales: ${fmt(upi)}** (${sales.filter(x => x.paymentBreakdown?.upi > 0).length} bills)`;
                else if (text.toLowerCase().includes('cash')) res = `💵 **Cash Sales: ${fmt(cash)}** (${sales.filter(x => x.paymentBreakdown?.cash > 0).length} bills)`;
                else res += `\nCash: ${fmt(cash)} | UPI: ${fmt(upi)}`;
                return { text: res };
            }
            case 'expensesToday': {
                const exp = (state.expenses || []).filter(e => toTimestamp(e.date || e.createdAt) >= todayTs);
                const total = exp.reduce((s, e) => s + (e.amount || 0), 0);
                return { text: `💸 **Expenses Today: ${fmt(total)}** (${exp.length} entries).` };
            }
            case 'checkStock': {
                const name = parseItemName(text);
                if (!name) return { text: "Which item? Try: *Stock of kurti*" };
                const matches = (state.items || []).filter(i => (i.name && i.name.toLowerCase().includes(name)) || (i.sku && i.sku.toLowerCase() === name));
                if (!matches.length) return { text: `❌ **"${esc(name)}"** not found.` };
                return { text: matches.map(i => `📦 **${esc(i.name)}**: ${i.stock} in stock (${fmt(i.sellingPrice)})`).join('\n') };
            }
            case 'addToCart': {
                const q = parseItemName(text); if (!q) return { text: "Add what to cart? Try: *Add LL313*" };
                const matches = (state.items || []).filter(i => (i.name && i.name.toLowerCase().includes(q)) || (i.sku && i.sku.toLowerCase() === q));
                if (!matches.length) return { text: `❌ Item **"${esc(q)}"** not found.` };
                if (matches.length > 1) {
                    let res = `Multiple found for **"${esc(q)}"**:\n\n<div class="flex flex-col gap-2 mt-2">`;
                    matches.slice(0, 4).forEach(m => { res += `<button data-item-sku="${esc(m.sku)}" class="chat-action-btn w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-[10px] font-black uppercase text-left flex justify-between hover:bg-violet-50 transition-all"><span>${esc(m.name)}</span> <span class="text-violet-600">${fmt(m.sellingPrice)}</span></button>`; });
                    return { text: res + `</div>` };
                }
                if (window.addCart) { window.addCart(matches[0].id); return { text: `✅ Added **${esc(matches[0].name)}** to cart!` }; }
                return { text: "Retail module unavailable." };
            }
            case 'addItem': {
                const name = parseItemName(text), price = parseAmount(text);
                if (!name && !price && window.openAddItem) { window.openAddItem(); return { text: "📝 Opening the New Product form..." }; }
                if (name && !price) return { text: `I can add **${esc(name)}**, but I need a selling price. Try: *"Add ${esc(name)} price 1800"*` };
                if (name && price) {
                    try {
                        if (!window.FB) return { text: "⚠️ Database connection not ready." };
                        const existingSkus = new Set((state.items || []).map(i => i.sku));
                        let skuNum = (state.items || []).length + 1001, sku; do { sku = "LL" + skuNum.toString().padStart(5, "0"); skuNum++; } while (existingSkus.has(sku));
                        await window.FB.collection('items').add({ name: name.charAt(0).toUpperCase() + name.slice(1), category: 'General', soldBy: 'pcs', stock: 0, sellingPrice: price, costPrice: 0, sku, barcode: sku, timestamp: Date.now() });
                        return { text: `✅ **${esc(name)}** cataloged! SKU: **${sku}** | Price: **${fmt(price)}**` };
                    } catch (e) { return { text: `❌ Sync Error: ${e.message}` }; }
                }
                return { text: "Try: *Add item Pashmina Saree 4500*" };
            }
            case 'pendingDues': return { text: `💳 **Outstanding Dashboard:**\nPOS: ${fmt((state.sales || []).reduce((s, x) => s + (x.balanceDue || 0), 0))} | Tailoring: ${fmt((state.orders || []).reduce((s, o) => s + Math.max(0, (o.totalCost || 0) - (o.advancePaid || 0) - (o.deliveryDiscount || 0)), 0))}` };
            case 'overdueOrders': {
                const overdue = (state.orders || []).filter(o => o.status !== 'Delivered' && o.deliveryDate && toTimestamp(o.deliveryDate) < Date.now());
                return { text: overdue.length ? `🚨 **${overdue.length} Overdue Orders:**\n` + overdue.slice(0, 5).map(o => `• **${esc(o.billNo)}**: ${esc(o.customerName)}`).join('\n') : "✅ No overdue orders." };
            }
            case 'profitToday': {
                const sales = (state.sales || []).filter(s => toTimestamp(s.date || s.createdAt) >= todayTs);
                const exp = (state.expenses || []).filter(e => toTimestamp(e.date || e.createdAt) >= todayTs);
                const revenue = sales.reduce((s, x) => s + (x.total || 0), 0);
                const spending = exp.reduce((s, e) => s + (e.amount || 0), 0);
                const profit = revenue - spending;
                return { text: `📈 **Daily Summary:**\nRevenue: ${fmt(revenue)}\nExpenses: ${fmt(spending)}\n---\n**Net Profit: ${fmt(profit)}** ${profit >= 0 ? '💰' : '⚠️'}` };
            }
            case 'billCount': {
                const sales = (state.sales || []).filter(s => toTimestamp(s.date || s.createdAt) >= todayTs);
                return { text: `🧾 You've generated **${sales.length} bills** today.` };
            }
            case 'topSelling': {
                const itemMap = {};
                (state.sales || []).filter(s => toTimestamp(s.date || s.createdAt) >= todayTs).forEach(s => {
                    (s.items || []).forEach(it => { itemMap[it.name] = (itemMap[it.name] || 0) + (it.qty || 1); });
                });
                const top = Object.entries(itemMap).sort((a,b) => b[1] - a[1]).slice(0, 5);
                if (!top.length) return { text: "No sales recorded today yet." };
                return { text: `💎 **Top Performers Today:**\n` + top.map(([name, qty], i) => `${i+1}. **${esc(name)}** (${qty} units)`).join('\n') };
            }
            case 'lowStock': {
                const low = (state.items || []).filter(i => (i.stock || 0) < 5);
                if (!low.length) return { text: "✅ All items are well stocked!" };
                return { text: `⚠️ **Stock Alerts (< 5 units):**\n` + low.map(i => `• **${esc(i.name)}**: ${i.stock} left`).join('\n') };
            }
            case 'urgentOrders': {
                const now = Date.now();
                const urgent = (state.orders || []).filter(o => o.status !== 'Delivered' && o.deliveryDate && (toTimestamp(o.deliveryDate) - now) < (48 * 60 * 60 * 1000) && (toTimestamp(o.deliveryDate) - now) >= 0);
                return { text: urgent.length ? `⏳ **${urgent.length} Orders Due Soon (next 48h):**\n` + urgent.slice(0, 5).map(o => `• **${esc(o.billNo)}**: ${esc(o.customerName)} (${new Date(toTimestamp(o.deliveryDate)).toLocaleDateString()})`).join('\n') : "✅ No urgent deadlines in the next 48 hours." };
            }
            case 'findClient': {
                const name = parseItemName(text);
                if (!name) return { text: "Who are you looking for? Try: *'Find Maryam'* " };
                const matches = (state.clients || []).filter(c => (c.name && c.name.toLowerCase().includes(name)) || (c.phone && c.phone.includes(name)));
                if (!matches.length) return { text: `❌ No client found matching **"${esc(name)}"**.` };
                return { text: `👤 **Client Results:**\n` + matches.slice(0, 3).map(c => `• **${esc(c.name)}** (${c.phone || 'No Phone'})`).join('\n') };
            }
            case 'newOrder': {
                if (window.openOrderModal) { window.openOrderModal(); return { text: "🧵 Opening the **New Tailoring Order** form for you..." }; }
                return { text: "Tailoring module not connected." };
            }
            case 'checkLoyalty': {
                const name = parseItemName(text).replace(/\bpoints\b/gi, '').trim();
                if (!name) return { text: "Whose points? Try: *'Points of Maryam'* " };
                const matches = (state.clients || []).filter(c => (c.name && c.name.toLowerCase().includes(name)) || (c.phone && c.phone.includes(name)));
                if (!matches.length) return { text: `❌ No rewards account found for **"${esc(name)}"**.` };
                return { text: matches.slice(0, 3).map(c => `👑 **${esc(c.name)}**: ${c.loyaltyPoints || 0} Points (${c.loyaltyTier || 'Basic'} Tier)`).join('\n') };
            }
            case 'viewCart': {
                const cart = state.cart || [];
                if (!cart.length) return { text: "🛒 Your cart is currently **empty**." };
                const total = cart.reduce((s, it) => s + (it.price * it.qty), 0);
                return { text: `🛒 **Cart Items (${cart.length}):**\n` + cart.map(it => `• ${it.qty}x **${esc(it.name)}** (${fmt(it.price * it.qty)})`).join('\n') + `\n---\n**Total: ${fmt(total)}**` };
            }
            case 'clearCart': {
                if (window.erpConfirm) {
                    const ok = await window.erpConfirm("Clear entire cart?", "AI Assistant");
                    if (ok) { state.cart = []; if (window.renderApp) window.renderApp(); return { text: "🧹 Cart cleared!" }; }
                    return { text: "Cart kept." };
                }
                state.cart = []; if (window.renderApp) window.renderApp(); return { text: "🧹 Cart cleared!" };
            }
            case 'addExpense': {
                const amt = parseAmount(text);
                if (!amt) return { text: "How much? Try: *'Add expense 500 for Tea'*" };
                if (window.FB && window.erpState) {
                    try {
                        await window.FB.collection('expenses').add({ date: Date.now(), category: 'AI Logged', amount: amt, description: text, paymentMethod: 'Cash', createdAt: Date.now() });
                        return { text: `✅ Recorded expense of **${fmt(amt)}**.` };
                    } catch (e) { return { text: `❌ Failed to save expense: ${e.message}` }; }
                }
                return { text: "Database connection busy." };
            }
            case 'ambiguousAdd': return { text: "Add what? ✨\n\n• **Item**: *'Add Pashmina 5000'* \n• **Expense**: *'Add expense 200 for Tea'*" };
            default: return null;
        }
    }

    // === RENDERERS ===

    function formatMarkdown(text) {
        if (!text) return "";
        let safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');
    }

    function formatTrustedUI(html) {
        return html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/\n/g, '<br>').replace(/<button/g, '<button class="chat-copy-btn p-1 absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white/50 rounded" ');
    }

    window.copyChatText = function (btn) {
        const text = btn.closest('.chat-bubble').innerText;
        navigator.clipboard.writeText(text).then(() => {
            const oldHtml = btn.innerHTML; btn.innerHTML = '<i data-lucide="check" class="w-3 h-3 text-emerald-500"></i>';
            if (window.lucide) lucide.createIcons();
            setTimeout(() => { btn.innerHTML = oldHtml; if (window.lucide) lucide.createIcons(); }, 2000);
        });
    };

    let _processing = false;
    window.closeChatbot = function() { const o = document.getElementById('chatbot-overlay'); if (o) o.remove(); };

    window.openChatbot = function () {
        if (document.getElementById('chatbot-overlay')) return;
        const overlay = document.createElement('div'); overlay.id = 'chatbot-overlay'; overlay.className = "fixed inset-0 z-[8999]";
        overlay.innerHTML = `
            <div class="absolute inset-0 bg-slate-900/10 transition-opacity" onclick="window.closeChatbot()"></div>
            <div class="fixed bottom-0 lg:bottom-10 right-0 lg:right-10 z-[9000] flex flex-col items-end p-4 lg:p-0 pointer-events-none">
                <div id="chatbot-window" onclick="event.stopPropagation()" class="bg-white/95 w-full lg:w-[440px] max-w-[95vw] h-[80vh] lg:h-[680px] rounded-[40px] shadow-[0_32px_80px_-16px_rgba(124,58,237,0.3)] border border-slate-200 flex flex-col overflow-hidden animate-pop-in mb-4 pointer-events-auto ring-1 ring-black/5">
                    <div class="bg-slate-950 p-8 flex items-center gap-5 shrink-0 relative overflow-hidden">
                        <div class="w-14 h-14 bg-gradient-to-tr from-violet-600 to-indigo-500 rounded-2xl flex items-center justify-center shadow-violet-500/40 relative"><span class="font-black text-white text-xl">L</span><div class="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-slate-900 rounded-full"></div></div>
                        <div class="flex-1 text-white"><h3 class="font-black text-base uppercase tracking-tight opacity-90">Lily Assistant</h3><div class="flex items-center gap-2"><span class="text-emerald-400 text-[8px] font-black uppercase tracking-[0.2em] animate-pulse">Live</span><span class="text-slate-500 text-[8px] font-bold uppercase leading-none">• Hybrid Intelligence v4</span></div></div>
                        <button onclick="window.closeChatbot()" class="w-12 h-12 flex items-center justify-center text-white/80 hover:text-white transition-all bg-white/5 rounded-full hover:bg-white/10 z-20 cursor-pointer active:scale-90"><i data-lucide="x" class="w-6 h-6"></i></button>
                    </div>
                    <div id="chat-messages" class="flex-1 overflow-y-auto px-6 py-8 space-y-6 bg-slate-50/10 custom-scrollbar scroll-smooth">
                        <div class="flex gap-4">
                            <div class="w-10 h-10 bg-white border border-slate-100 rounded-2xl flex items-center justify-center text-violet-600 text-xs font-black">L</div>
                            <div class="bg-white p-5 rounded-3xl rounded-tl-none border border-slate-100 shadow-sm max-w-[85%] text-sm leading-relaxed">Greetings! I am **Lily**. 🌸 Ask me anything about your boutique!</div>
                        </div>
                    </div>
                    <div class="px-6 py-4 flex gap-2 overflow-x-auto no-scrollbar border-t border-slate-100 shrink-0 bg-white/50">
                        <button onclick="document.getElementById('chat-input').value='sales today'; window.sendChatMessage()" class="whitespace-nowrap px-4 py-2 bg-white border border-slate-200 rounded-2xl text-[9px] font-black uppercase tracking-widest hover:border-violet-300 hover:text-violet-600 transition-all">Sales</button>
                        <button onclick="document.getElementById('chat-input').value='pending dues'; window.sendChatMessage()" class="whitespace-nowrap px-4 py-2 bg-white border border-slate-200 rounded-2xl text-[9px] font-black uppercase tracking-widest hover:border-violet-300 hover:text-violet-600 transition-all">Dues</button>
                        <button onclick="document.getElementById('chat-input').value='overdue orders'; window.sendChatMessage()" class="whitespace-nowrap px-4 py-2 bg-white border border-slate-200 rounded-2xl text-[9px] font-black uppercase tracking-widest hover:border-violet-300 hover:text-violet-600 transition-all">Orders</button>
                        <button onclick="document.getElementById('chat-input').value='help'; window.sendChatMessage()" class="whitespace-nowrap px-4 py-2 bg-white border border-slate-200 rounded-2xl text-[9px] font-black uppercase tracking-widest hover:border-violet-300 hover:text-violet-600 transition-all">Help</button>
                    </div>
                    <div class="p-6 bg-white border-t border-slate-100 shrink-0">
                        <div class="flex gap-4 bg-slate-50 p-2 rounded-[32px] border border-slate-100 focus-within:bg-white focus-within:ring-4 focus-within:ring-violet-50 transition-all">
                            <input id="chat-input" type="text" placeholder="Speak to Lily..." class="flex-1 px-4 py-4 bg-transparent font-bold text-sm outline-none" onkeydown="if(event.key==='Enter')window.sendChatMessage()">
                            <button id="chat-send-btn" onclick="window.sendChatMessage()" class="w-12 h-12 bg-violet-600 text-white rounded-2xl shadow-lg hover:bg-violet-700 active:scale-90 transition-all flex items-center justify-center"><i data-lucide="send" class="w-5 h-5"></i></button>
                        </div>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        document.getElementById('chat-messages').addEventListener('click', (e) => {
            const btn = e.target.closest('.chat-action-btn'); if (btn) { const sku = btn.getAttribute('data-item-sku'); const input = document.getElementById('chat-input'); if (input && sku) { input.value = `sell ${sku}`; window.sendChatMessage(); } }
        });
        if (window.lucide) lucide.createIcons(); document.getElementById('chat-input').focus();
    };

    window.sendChatMessage = async function () {
        if (_processing) return;
        const input = document.getElementById('chat-input'), sendBtn = document.getElementById('chat-send-btn'), messages = document.getElementById('chat-messages');
        if (!input || !messages) return;
        const text = input.value.trim();
        if (!text) return;
        if (text.length > 500) { messages.insertAdjacentHTML('beforeend', `<div class="flex justify-end p-2"><div class="text-rose-500 text-[10px] font-black uppercase tracking-wider">Length Limit: 500 chars</div></div>`); messages.scrollTop = messages.scrollHeight; return; }

        _processing = true; input.disabled = true; if (sendBtn) sendBtn.disabled = true; input.value = '';
        const tid = 'tid-' + Date.now();
        // Mobile Haptic
        if (navigator.vibrate) navigator.vibrate(50);

        try {
            messages.insertAdjacentHTML('beforeend', `<div class="flex justify-end pr-2"><div class="bg-violet-600 text-white p-5 rounded-3xl rounded-tr-none max-w-[80%] shadow-xl shadow-violet-500/10 text-sm font-semibold leading-relaxed">${esc(text)}</div></div>`);
            messages.scrollTop = messages.scrollHeight;
            _chatHistory.push({ role: 'user', text });

            messages.insertAdjacentHTML('beforeend', `
                <div id="${tid}" class="flex gap-4">
                    <div class="w-10 h-10 bg-white border border-slate-100 rounded-2xl flex items-center justify-center text-violet-600 text-[10px] font-black shrink-0 relative">L<div class="absolute -top-1 -right-1 w-2 h-2 bg-violet-400 rounded-full animate-ping"></div></div>
                    <div class="bg-white/80 p-5 rounded-3xl border border-slate-100 shadow-sm flex gap-1.5 items-center relative overflow-hidden">
                        <div class="w-1.5 h-1.5 bg-violet-200 rounded-full animate-bounce"></div>
                        <div class="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style="animation-delay:150ms"></div>
                        <div class="w-1.5 h-1.5 bg-violet-600 rounded-full animate-bounce" style="animation-delay:300ms"></div>
                        <div id="${tid}-alert" class="absolute bottom-1 right-2 opacity-0 transition-opacity text-[6px] text-slate-400 uppercase font-black">Connection Slow...</div>
                    </div>
                </div>`);
            messages.scrollTop = messages.scrollHeight;

            const tAlert = setTimeout(() => { const el = document.getElementById(tid + '-alert'); if (el) el.style.opacity = '1'; }, 8000);

            let resp = null, intent = getLocalIntent(text), isLocal = false;
            if (intent) { resp = await executeLocal(intent, text); if (resp) isLocal = true; }
            if (!resp) { resp = await callGemini(text); isLocal = false; }

            clearTimeout(tAlert);
            const thinking = document.getElementById(tid); if (thinking) thinking.remove();
            
            _chatHistory.push({ role: 'lily', text: resp.text });
            while (_chatHistory.length > 20) _chatHistory.shift();

            messages.insertAdjacentHTML('beforeend', `
                <div class="flex flex-col gap-3 group">
                    <div class="flex gap-4 relative">
                        <div class="w-10 h-10 bg-white border border-slate-100 rounded-2xl flex items-center justify-center text-violet-600 text-xs font-black shrink-0">L</div>
                        <div class="bg-white p-5 rounded-3xl rounded-tl-none border border-slate-100 shadow-sm max-w-[85%] text-sm text-slate-700 leading-relaxed shadow-sm relative chat-bubble">
                            <button onclick="window.copyChatText(this)" class="chat-copy-btn p-1 absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-slate-400"><i data-lucide="copy" class="w-3 h-3"></i></button>
                            ${isLocal ? formatTrustedUI(resp.text) : formatMarkdown(resp.text)}
                        </div>
                    </div>
                    ${resp.actionResult ? `
                    <div class="ml-14 animate-pop-in">
                        <div class="bg-slate-900 text-white p-4 rounded-2xl border border-slate-700 shadow-2xl flex items-center gap-3">
                            <div class="w-8 h-8 rounded-xl ${resp.actionResult.success ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'} flex items-center justify-center"><i data-lucide="${resp.actionResult.success ? 'check-circle' : 'alert-triangle'}" class="w-4 h-4"></i></div>
                            <div class="flex-1"><p class="text-[7px] font-black uppercase text-slate-400 tracking-[0.2em] mb-0.5">Execution Log</p><p class="font-bold text-[10px] leading-tight">${formatTrustedUI(esc(resp.actionResult.message))}</p></div>
                        </div>
                    </div>` : ''}
                </div>`);
            if (window.lucide) lucide.createIcons(); messages.scrollTop = messages.scrollHeight;
        } catch (err) {
            console.error(err); const thinking = document.getElementById(tid); if (thinking) thinking.remove();
            if (_chatHistory.length && _chatHistory[_chatHistory.length-1].role === 'user') _chatHistory.pop();
            messages.insertAdjacentHTML('beforeend', `<div class="text-center p-4 text-rose-500 text-[10px] font-black uppercase">System Engine Error: Check connection</div>`);
        } finally { _processing = false; if (input) { input.disabled = false; input.focus(); } if (sendBtn) sendBtn.disabled = false; }
    };

    window.renderChatFAB = function () {
        if (document.getElementById('chat-integrated-btn') || document.getElementById('chat-fab')) return;
        
        const isMobile = window.innerWidth < 1024;
        const headerRight = document.querySelector('.header-right') || document.querySelector('header > div:last-child');
        
        // On Desktop, if we have a header right container, integrate it
        if (!isMobile && headerRight && headerRight.classList.contains('flex')) {
            const btn = document.createElement('button'); 
            btn.id = 'chat-integrated-btn'; 
            btn.onclick = window.openChatbot;
            btn.className = "flex items-center gap-3 px-5 py-3 bg-slate-950 text-white rounded-2xl shadow-xl shadow-slate-200 text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all ml-3 shrink-0 ring-1 ring-white/10";
            btn.innerHTML = `<i data-lucide="sparkles" class="w-4 h-4 text-violet-400"></i> Ask Lily`;
            headerRight.insertBefore(btn, headerRight.firstChild);
            if (window.lucide) lucide.createIcons();
        } else {
            // On Mobile or if no header container, use a FAB
            const fab = document.createElement('div'); 
            fab.id = 'chat-fab';
            const fabStyles = isMobile 
                ? "bottom-6 right-6 w-14 h-14 rounded-2xl" 
                : "bottom-8 right-8 w-20 h-20 rounded-[28px]";
            
            fab.innerHTML = `<button onclick="window.openChatbot()" class="fixed ${fabStyles} z-[8000] bg-slate-950 text-white shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all group ring-1 ring-white/10 border border-white/5"><i data-lucide="sparkles" class="${isMobile ? 'w-6 h-6' : 'w-8 h-8'} text-violet-400"></i></button>`;
            document.body.appendChild(fab);
            if (window.lucide) lucide.createIcons();
        }
    };
    if (document.readyState === 'complete') window.renderChatFAB(); else window.addEventListener('load', () => setTimeout(window.renderChatFAB, 800));
    window.addEventListener('resize', () => {
        // Redraw FAB on resize if needed (e.g. tablet rotation)
        const fab = document.getElementById('chat-fab');
        const integrated = document.getElementById('chat-integrated-btn');
        if ((window.innerWidth < 1024 && integrated) || (window.innerWidth >= 1024 && fab)) {
            if (fab) fab.remove();
            if (integrated) integrated.remove();
            window.renderChatFAB();
        }
    });
})();
