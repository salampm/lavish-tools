// Lavish Lavender AI Assistant — Hybrid Intelligence System (Local + Gemini 1.5)
(function () {

    const BOT_NAME = "Lily";
    window.LILY_VERSION = "2.4.6_SMART";
    const GEMINI_URL = "https://little-violet-7bc7.lavishlavenderin.workers.dev?t=" + Date.now() + "&v=2.4.6";

    const COMMANDS = [
        { patterns: ['add item', 'new item', 'create item', 'add product', 'add inventory', 'save to inventory'], action: 'addItem' },
        { patterns: ['today', 'report', 'how was today', 'sales today', 'summary'], action: 'todayReport' },
        { patterns: ['stock', 'inventory', 'check', 'quantity', 'available'], action: 'checkStock' },
        { patterns: ['profit', 'how much profit', 'net today'], action: 'profitToday' },
        { patterns: ['points', 'loyalty', 'loyalty points', 'points for'], action: 'checkLoyalty' },
        { patterns: ['sell', 'bill', 'checkout', 'add to cart'], action: 'addToCart' },
        { patterns: ['top', 'best seller', 'most sold', 'popular'], action: 'topProducts' },
        { patterns: ['due', 'pending', 'owe', 'money', 'collections', 'dues'], action: 'pendingDues' },
        { patterns: ['expense', 'spent', 'spending', 'cost'], action: 'expenseSummary' },
        { patterns: ['last receipt', 'latest bill', 'show receipt', 'view receipt'], action: 'viewLastReceipt' },
        { patterns: ['print last', 'print bill', 'print receipt'], action: 'printLast' },
        { patterns: ['print receipt for', 'print bill for', 'find receipt for'], action: 'printSpecificReceipt' },
        { patterns: ['whatsapp', 'message', 'send reminder', 'notify', 'text'], action: 'sendSmartWhatsApp' },
        { patterns: ['dashboard', 'open dashboard', 'show analytics'], action: 'gotoDashboard' },
        { patterns: ['pos', 'retail', 'terminal', 'open terminal'], action: 'gotoPOS' },
        { patterns: ['tailoring', 'orders', 'stitching'], action: 'gotoTailoring' },
        { patterns: ['help', 'what can you do', 'what are your commands'], action: 'help' }
    ];

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

    let _chatHistory = [];

    // === UTILITIES ===
    function getTodayTimestamp() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
    function toTimestamp(val) {
        if (!val) return 0;
        if (typeof val === 'number') return val;
        if (val.toMillis) return val.toMillis();
        if (val.toDate) return val.toDate().getTime();
        const d = new Date(val);
        return isNaN(d.getTime()) ? 0 : d.getTime();
    }
    function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
    function fmt(v) { return '₹' + (parseFloat(v) || 0).toLocaleString('en-IN'); }

    function parseAmount(text) {
        const match = text.match(/(?:₹|rs\.?|rupees?)\s*(\d[\d,]*\.?\d*)/i) || text.match(/(\d[\d,]*\.?\d*)\s*(?:₹|rs|rupees?)/i);
        return match ? parseFloat(match[1].replace(/,/g, '')) : null;
    }

    function parseItemName(text) {
        let cleaned = text.toLowerCase();
        CLEANER_REGEXES.forEach(rx => { cleaned = cleaned.replace(rx, ''); });
        cleaned = cleaned.replace(/\b(?:₹|rs\.?|rupees?)\s*\d[\d,]*\.?\d*\b/gi, '').replace(/[^\w\s\d]/g, '').trim();
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
        const now = new Date();
        const monthStr = now.toISOString().substring(0, 7);

        // 1. Boutique Performance
        const sales = (state.sales || []).filter(s => s.date.startsWith(monthStr));
        const rev = sales.reduce((acc, s) => acc + (parseFloat(s.total) || 0), 0);
        const exp = (state.expenses || []).filter(e => e.date.startsWith(monthStr)).reduce((acc, e) => acc + (parseFloat(e.amount) || 0), 0);
        
        // 2. Active Tailoring
        const activeOrders = (state.orders || []).filter(o => o.status !== 'Delivered').map(o => ({ 
            bill: o.billNo, name: o.customerName, bal: (o.totalCost||0)-(o.advancePaid||0), status: o.status, phone: o.phone 
        }));

        // 3. Client Loyalty
        const clients = (state.clients || []).slice(0, 50).map(c => `${c.name}: ${c.loyaltyPoints} pts (${c.phone})`);

        // 4. WhatsApp Templates for reference
        const templates = state.whatsappTemplates || {};

        return `
            [FINANCIALS ${monthStr}] Rev: ${fmt(rev)} | Exp: ${fmt(exp)} | Net: ${fmt(rev-exp)}
            [ACTIVE ORDERS] ${JSON.stringify(activeOrders.slice(0,15))}
            [CLIENTS] ${clients.join(', ')}
            [MESSAGING TEMPLATES] ${JSON.stringify(templates)}
        `.trim();
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
                if (start !== -1 && end !== -1) return JSON.parse(candidate.substring(start, end));
            } catch (e) { continue; }
        }
        return null;
    }

    async function callGemini(userPrompt) {
        const context = buildAIContext();
        const LILY_PROMPT = `
            You are Lily, the boutique's AI brain. 2026 Edition.
            
            [SYSTEM ACTIONS]
            Output JSON: {"action": "ACTION_NAME", "params": {DATA}}
            
            ACTIONS:
            1. printSpecificReceipt: {billNo: "B-..." or customerName: "..."}
            2. sendWhatsApp: {phone: "91...", message: "Smart message text here"}
            3. addItem: {name, sku, category, price, stock}
            4. viewLastReceipt: {}
            5. printLast: {}
            6. gotoDashboard / gotoPOS / gotoTailoring: {}
            
            SMART MESSAGING:
            When sending WhatsApp reminders, use the templates in context but make them "smarter" and more personal. 
            If they have a balance, mention it politely. If they have loyalty points, include a "Reward Alert".
            
            [DATA]
            ${context}
        `.trim();

        try {
            const res = await fetch(GEMINI_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: `${LILY_PROMPT}\n\nUSER REQUEST: ${userPrompt}` }] }],
                    generationConfig: { temperature: 0.2, maxOutputTokens: 1024 }
                })
            });
            const data = await res.json();
            let responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "Lily encountered a data fog. Switching to local mode...";
            
            const action = extractAction(responseText);
            if (action) {
                await executeAction(action);
                responseText = responseText.replace(/\{[\s\S]*?"action"[\s\S]*?\}/g, '').trim();
            }
            return { text: responseText };
        } catch (e) { 
            const localResp = await executeLocal(getLocalIntent(userPrompt), userPrompt);
            return localResp || { text: "⚠️ System busy. Operating in offline mode." };
        }
    }

    async function executeAction(json) {
        if (!json || !json.action) return;
        const state = window.erpState;
        const msg = document.getElementById('chat-messages');

        switch (json.action) {
            case 'printSpecificReceipt':
                const query = (json.params.billNo || json.params.customerName || "").toLowerCase();
                const target = (state.sales || []).concat(state.orders || []).find(x => 
                    (x.billNo && x.billNo.toLowerCase() === query) || 
                    (x.customerName && x.customerName.toLowerCase().includes(query))
                );
                if (target && window.generateThermalPrint) {
                    const printData = target.items ? target : {
                        billNo: target.billNo, customerName: target.customerName, customerPhone: target.phone,
                        date: target.orderDate || target.timestamp, items: target.items || [],
                        subtotal: target.totalCost || target.total || 0, total: target.total || target.totalCost || 0,
                        paid: target.advancePaid || target.total || 0, balance: target.balance || 0
                    };
                    window.generateThermalPrint(printData);
                }
                break;

            case 'sendWhatsApp':
                const phone = window.sanitizePhone(json.params.phone);
                const text = json.params.message;
                if (phone && text) {
                    const url = `https://wa.me/${phone.length === 10 ? '91' + phone : phone}?text=${encodeURIComponent(text)}`;
                    window.open(url, '_blank');
                    msg.insertAdjacentHTML('beforeend', `<div class="text-center p-2 text-emerald-500 text-[9px] font-black uppercase">WhatsApp Dispatched ✅</div>`);
                }
                break;

            case 'viewLastReceipt':
                const latest = (state.sales || []).sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
                if (latest && window.viewReceipt) window.viewReceipt(latest.id);
                break;
            case 'printLast':
                const lastBill = (state.sales || []).sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
                if (lastBill && window.printReceipt) window.printReceipt(lastBill);
                break;
            case 'gotoDashboard': location.href = 'index.html'; break;
            case 'gotoPOS': location.href = 'pos.html'; break;
            case 'gotoTailoring': location.href = 'tailoring.html'; break;
        }
        if (window.lucide) lucide.createIcons();
        msg.scrollTop = msg.scrollHeight;
    }

    // === LOCAL HANDLERS ===
    async function executeLocal(action, text) {
        const state = window.erpState;
        const now = new Date().toISOString().split('T')[0];
        const fmt = window.fmt || ((v) => '₹' + (v || 0).toLocaleString('en-IN'));

        switch (action) {
            case 'help': 
                return { text: `**Lily's Skill Matrix** 🧠\n\n` +
                    `1. **Messaging**: *"Send WhatsApp reminder to Zubaida"* 📱\n` +
                    `2. **Printing**: *"Print receipt for B-105"* or *"Zubaida"* 🖨️\n` +
                    `3. **Stock**: *"Quantity of Saree"* or *"LL501"* 📦\n` +
                    `4. **Finance**: *"Sales today"* or *"Net profit"* 📈\n` +
                    `5. **POS**: *"Add kurti to cart"* or *"Checkout"* 🛒\n` +
                    `6. **Expenses**: *"Monthly expense report"* 💸\n` +
                    `7. **Rewards**: *"Loyalty points of Maryam"* 👑\n` +
                    `8. **Navigation**: *"Go to Tailoring"* or *"Open POS"* 🗺️` };
            
            case 'printSpecificReceipt': {
                const query = text.toLowerCase().replace(/print receipt for|bill for|receipt for/gi, '').trim();
                const target = (state.orders || []).concat(state.sales || []).find(o => 
                    (o.billNo && o.billNo.toLowerCase() === query) || (o.customerName && o.customerName.toLowerCase().includes(query))
                );
                if (target) {
                    await executeAction({ action: 'printSpecificReceipt', params: { billNo: target.billNo } });
                    return { text: `Pulling up data for **${esc(target.customerName)}** (${target.billNo})... 📄` };
                }
                return { text: `Couldn't find a record for **"${esc(query)}"**. Check the Bill #?` };
            }

            case 'sendSmartWhatsApp': {
                const query = text.toLowerCase().replace(/send whatsapp|message|reminder to/gi, '').trim();
                const target = (state.orders || []).find(o => o.customerName && o.customerName.toLowerCase().includes(query));
                if (target) {
                    const bal = (target.totalCost || 0) - (target.advancePaid || 0);
                    const msg = `Hi ${target.customerName}, 🌸 Friendly reminder from Lavish Lavender for order ${target.billNo}. Balance: ${fmt(bal)}. Visit again!`;
                    await executeAction({ action: 'sendWhatsApp', params: { phone: target.phone, message: msg } });
                    return { text: `Opening WhatsApp for **${esc(target.customerName)}**... 📱` };
                }
                return { text: "Who should I message? Try: *'Reminder to Zubaida'* " };
            }

            case 'todayReport': {
                const todaySales = (state.sales || []).filter(s => s.date === now);
                const rev = todaySales.reduce((acc, s) => acc + (parseFloat(s.total) || 0), 0);
                return { text: `**Today's Status (Local)** 🌸\n\n• Sales: **${todaySales.length}**\n• Revenue: **${fmt(rev)}**` };
            }

            case 'checkStock': {
                const name = parseItemName(text);
                const matches = (state.items || []).filter(i => (i.name && i.name.toLowerCase().includes(name)) || (i.sku && i.sku.toLowerCase() === name));
                if (!matches.length) return { text: `🔍 Found **0** items matching **"${esc(name)}"**.` };
                return { text: matches.slice(0, 3).map(i => `📦 **${esc(i.name)}**: ${i.quantity} left (${fmt(i.price)})`).join('\n') };
            }

            case 'pendingDues': {
                const total = (state.sales || []).reduce((acc, s) => acc + (parseFloat(s.balanceDue || 0)), 0);
                const tBal = (state.orders || []).filter(o => o.status !== 'Delivered').reduce((acc, o) => acc + ((o.totalCost||0)-(o.advancePaid||0)), 0);
                return { text: `💰 **Outstanding Dues**:\nRetail: ${fmt(total)}\nTailoring: ${fmt(tBal)}\n\n**Total: ${fmt(total + tBal)}**` };
            }

            case 'gotoDashboard': location.href = 'index.html'; return { text: "Navigating to Dashboard..." };
            case 'gotoPOS': location.href = 'pos.html'; return { text: "Opening Retail Terminal..." };
            case 'gotoTailoring': location.href = 'tailoring.html'; return { text: "Switching to Tailoring..." };

            default: return null;
        }
    }

    // === UI RENDERERS ===
    function formatMarkdown(text) {
        if (!text) return "";
        let safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');
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
            <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onclick="window.closeChatbot()"></div>
            <div class="fixed inset-0 lg:inset-auto lg:bottom-10 lg:right-10 z-[9000] flex flex-col items-end p-0 lg:p-0 pointer-events-none">
                <div id="chatbot-window" onclick="event.stopPropagation()" class="bg-white/95 w-full h-full lg:w-[440px] lg:h-[680px] lg:rounded-[40px] shadow-2xl border-0 lg:border border-slate-200 flex flex-col overflow-hidden animate-pop-in pointer-events-auto ring-1 ring-black/5">
                    <div class="bg-slate-950 p-6 lg:p-8 flex items-center gap-4 shrink-0 relative overflow-hidden">
                        <div class="w-12 h-12 lg:w-14 lg:h-14 bg-gradient-to-tr from-violet-600 to-indigo-500 rounded-2xl flex items-center justify-center shadow-violet-500/40 relative">
                            <span class="font-black text-white text-lg lg:text-xl">L</span>
                            <div class="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-500 border-2 border-slate-950 rounded-full"></div>
                        </div>
                        <div class="flex-1 text-white">
                            <h3 class="font-black text-sm lg:text-base uppercase tracking-tight opacity-90">Lily Assistant</h3>
                            <div class="flex items-center gap-1.5">
                                <span class="text-emerald-400 text-[8px] font-black uppercase tracking-[0.2em] animate-pulse">Live</span>
                                <span class="text-slate-500 text-[8px] font-bold uppercase leading-none">• Smart v2.4.6</span>
                            </div>
                        </div>
                        <button onclick="window.closeChatbot()" class="w-12 h-12 flex items-center justify-center text-white/50 hover:text-white transition-all bg-white/5 rounded-xl hover:bg-white/10 z-20 cursor-pointer active:scale-90">
                            <i data-lucide="x" class="w-6 h-6"></i>
                        </button>
                    </div>
                    <div id="chat-messages" class="flex-1 overflow-y-auto px-6 py-8 space-y-6 bg-slate-50/10 custom-scrollbar scroll-smooth"></div>
                    <div class="px-6 py-2 flex gap-2 overflow-x-auto no-scrollbar border-t border-slate-100 shrink-0 bg-white/50">
                        <button onclick="document.getElementById('chat-input').value='today report'; window.sendChatMessage()" class="whitespace-nowrap px-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-[9px] font-black uppercase tracking-widest hover:border-violet-300 hover:text-violet-600 transition-all shadow-sm">Report</button>
                        <button onclick="document.getElementById('chat-input').value='stock check'; window.sendChatMessage()" class="whitespace-nowrap px-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-[9px] font-black uppercase tracking-widest hover:border-violet-300 hover:text-violet-600 transition-all shadow-sm">Stock</button>
                        <button onclick="document.getElementById('chat-input').value='reminder to '; document.getElementById('chat-input').focus();" class="whitespace-nowrap px-4 py-2.5 bg-emerald-50 border border-emerald-100 rounded-2xl text-[9px] font-black uppercase tracking-widest text-emerald-600 shadow-sm">Message</button>
                        <button onclick="document.getElementById('chat-input').value='print receipt for '; document.getElementById('chat-input').focus();" class="whitespace-nowrap px-4 py-2.5 bg-violet-50 border border-violet-100 rounded-2xl text-[9px] font-black uppercase tracking-widest text-violet-600 shadow-sm">Print</button>
                    </div>
                    <div class="p-6 bg-white border-t border-slate-100 shrink-0">
                        <div class="flex gap-4 bg-slate-50 p-1.5 rounded-[30px] border border-slate-100 focus-within:bg-white focus-within:ring-4 focus-within:ring-violet-100/50 transition-all">
                            <input id="chat-input" type="text" placeholder="Speak to Lily..." class="flex-1 px-4 py-4 bg-transparent font-bold text-sm outline-none" onkeydown="if(event.key==='Enter')window.sendChatMessage()">
                            <button id="chat-send-btn" onclick="window.sendChatMessage()" class="w-12 h-12 bg-slate-900 text-white rounded-2xl shadow-lg hover:bg-violet-600 active:scale-95 transition-all flex items-center justify-center"><i data-lucide="send" class="w-5 h-5"></i></button>
                        </div>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        if (window.lucide) lucide.createIcons(); document.getElementById('chat-input').focus();
    };

    window.sendChatMessage = async function () {
        if (_processing) return;
        const input = document.getElementById('chat-input'), sendBtn = document.getElementById('chat-send-btn'), messages = document.getElementById('chat-messages');
        if (!input || !messages) return;
        const text = input.value.trim();
        if (!text) return;

        _processing = true; input.disabled = true; if (sendBtn) sendBtn.disabled = true; input.value = '';
        const tid = 'tid-' + Date.now();

        try {
            messages.insertAdjacentHTML('beforeend', `<div class="flex justify-end pr-2"><div class="bg-violet-600 text-white p-5 rounded-3xl rounded-tr-none max-w-[80%] shadow-sm text-sm font-semibold leading-relaxed">${esc(text)}</div></div>`);
            messages.scrollTop = messages.scrollHeight;

            messages.insertAdjacentHTML('beforeend', `
                <div id="${tid}" class="flex gap-4">
                    <div class="w-10 h-10 bg-white border border-slate-100 rounded-2xl flex items-center justify-center text-violet-600 text-[10px] font-black shrink-0 relative">L</div>
                    <div class="bg-white/80 p-5 rounded-3xl border border-slate-100 shadow-sm flex gap-1.5 items-center relative overflow-hidden">
                        <div class="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce"></div>
                        <div class="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style="animation-delay:150ms"></div>
                        <div class="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style="animation-delay:300ms"></div>
                    </div>
                </div>`);
            messages.scrollTop = messages.scrollHeight;

            let resp = null, intent = getLocalIntent(text);
            if (intent && action !== 'sendSmartWhatsApp' && action !== 'printSpecificReceipt') { 
                // We actually want Gemini to handle WhatsApp and Specific Printing for "Smart" features
                // But fallback to local if needed
            }
            
            resp = await callGemini(text);

            const thinking = document.getElementById(tid); if (thinking) thinking.remove();
            
            messages.insertAdjacentHTML('beforeend', `
                <div class="flex flex-col gap-3 group">
                    <div class="flex gap-4 relative">
                        <div class="w-10 h-10 bg-white border border-slate-100 rounded-2xl flex items-center justify-center text-violet-600 text-xs font-black shrink-0">L</div>
                        <div class="bg-white p-5 rounded-3xl rounded-tl-none border border-slate-100 shadow-sm max-w-[85%] text-sm text-slate-700 leading-relaxed relative chat-bubble">
                            <button onclick="window.copyChatText(this)" class="chat-copy-btn p-1 absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-50 border border-slate-200 rounded text-slate-400"><i data-lucide="copy" class="w-3 h-3"></i></button>
                            ${formatMarkdown(resp.text)}
                        </div>
                    </div>
                </div>`);
            if (window.lucide) lucide.createIcons(); messages.scrollTop = messages.scrollHeight;
        } catch (err) {
            console.error(err);
            if(document.getElementById(tid)) document.getElementById(tid).remove();
            messages.insertAdjacentHTML('beforeend', `<div class="text-center p-4 text-rose-500 text-[10px] font-black uppercase">Service Busy</div>`);
        } finally { _processing = false; if (input) { input.disabled = false; input.focus(); } if (sendBtn) sendBtn.disabled = false; }
    };

    window.renderChatFAB = function () {
        if (document.getElementById('chat-integrated-btn') || document.getElementById('chat-fab')) return;
        const btn = document.createElement('button'); 
        btn.id = 'chat-integrated-btn'; 
        btn.onclick = window.openChatbot;
        btn.className = "flex items-center gap-3 px-5 py-3 bg-slate-950 text-white rounded-2xl shadow-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all fixed bottom-8 right-8 z-[8000] ring-1 ring-white/10";
        btn.innerHTML = `<i data-lucide="sparkles" class="w-4 h-4 text-violet-400"></i> Ask Lily`;
        document.body.appendChild(btn);
        if (window.lucide) lucide.createIcons();
    };
    if (document.readyState === 'complete') window.renderChatFAB(); else window.addEventListener('load', window.renderChatFAB);
})();
