// Lavish Lavender AI Assistant — Hybrid Intelligence System (Local + Gemini 1.5)
(function () {

    const BOT_NAME = "Lily";
    window.LILY_VERSION = "2.5.1_ULTIMATE";
    const GEMINI_URL = "https://little-violet-7bc7.lavishlavenderin.workers.dev?t=" + Date.now() + "&v=2.5.1";

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
    let _lastUserPrompt = "";

    // === UTILITIES ===
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

        const dateFilter = (d) => {
            if (typeof d === 'string') return d.startsWith(monthStr);
            const ts = toTimestamp(d);
            return ts > 0 && new Date(ts).toISOString().startsWith(monthStr);
        };

        const sales = (state.sales || []).filter(s => dateFilter(s.date));
        const rev = sales.reduce((acc, s) => acc + (parseFloat(s.total) || 0), 0);
        const exp = (state.expenses || []).filter(e => dateFilter(e.date)).reduce((acc, e) => acc + (parseFloat(e.amount) || 0), 0);
        
        const activeOrders = (state.orders || []).filter(o => o.status !== 'Delivered').map(o => ({ 
            bill: o.billNo, name: o.customerName, bal: (o.totalCost||0)-(o.advancePaid||0), status: o.status, phone: o.phone 
        }));

        // OPTIMIZATION: Semantic Client Context Selection
        const mention = (_lastUserPrompt || "").toLowerCase();
        const relevantClients = (state.clients || []).filter(c => mention.includes(c.name?.toLowerCase())).slice(0, 5);
        const topLoyalty = (state.clients || []).slice().sort((a,b) => (b.loyaltyPoints||0)-(a.loyaltyPoints||0)).slice(0, 10);
        const clients = [...new Set([...relevantClients, ...topLoyalty])].map(c => `${c.name}: ${c.loyaltyPoints} pts (${c.phone})`);

        const templates = state.whatsappTemplates || {};
        const historyContext = _chatHistory.slice(-6).map(m => `${m.role === 'user' ? 'User' : 'Lily'}: ${m.text}`).join('\n');

        return `
            [CONVERSATION HISTORY]
            ${historyContext || '(Started)'}
            [BOUTIQUE ${monthStr}] Rev: ${fmt(rev)} | Exp: ${fmt(exp)} | Net: ${fmt(rev-exp)} | Clients: ${(state.clients||[]).length}
            [ACTIVE ORDERS] ${JSON.stringify(activeOrders.slice(0,10))}
            [RELEVANT CLIENTS] ${clients.join(', ')}
            [TEMPLATE GUIDE] ${JSON.stringify(templates)}
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
                if (start !== -1 && end !== -1) {
                    const parsed = JSON.parse(candidate.substring(start, end));
                    if (parsed && parsed.action) {
                        parsed.params = parsed.params || {};
                        return parsed;
                    }
                }
            } catch (e) { continue; }
        }
        return null;
    }

    async function callGemini(userPrompt) {
        try {
            const context = buildAIContext();
            const LILY_PROMPT = `You are Lily, the AI for Lavish Lavender Bridal Boutique. Tone: Pro, concise, premium. Output JSON at end: {"action": "NAME", "params": {}}.
            - printSpecificReceipt: {billNo OR customerName}
            - sendWhatsApp: {phone, message} - composing warm, personalized context-aware msgs.
            - viewLastReceipt / printLast / gotoDashboard / gotoPOS / gotoTailoring: {}
            [CONTEXT]
            ${context}`;

            const res = await fetch(GEMINI_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: `${LILY_PROMPT}\n\nUSER: ${userPrompt}` }] }],
                    generationConfig: { temperature: 0.2, maxOutputTokens: 1024 }
                })
            });
            const data = await res.json();
            let responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "Thinking mode interrupted. Using local logic...";
            
            const action = extractAction(responseText);
            if (action) {
                const actionResult = await executeAction(action);
                if (actionResult && actionResult.text) responseText = `[Done: ${actionResult.text}]\n\n` + responseText;
                if (actionResult && actionResult.navigate) return { text: responseText, navigate: actionResult.navigate };
                responseText = responseText.replace(/\{[\s\S]*?"action"[\s\S]*?\}/g, '').trim();
            }
            return { text: responseText };
        } catch (e) { 
            console.error('[Lily] Gemini failure:', e);
            try {
                const intent = getLocalIntent(userPrompt);
                const localResp = await executeLocal(intent, userPrompt);
                if (localResp) return localResp;
            } catch (localErr) { console.error('[Lily] Local fallback fail:', localErr); }
            return { text: "⚠️ System busy. Try a direct command like *'Stock Kurti'*." };
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
                    (x.billNo && x.billNo.toLowerCase() === query) || (x.customerName && x.customerName.toLowerCase().includes(query))
                );
                if (target && window.generateThermalPrint) {
                    const printData = target.items ? target : {
                        billNo: target.billNo, customerName: target.customerName, customerPhone: target.phone,
                        date: target.orderDate || target.timestamp, items: target.items || [],
                        subtotal: target.totalCost || target.total || 0, total: target.total || target.totalCost || 0,
                        paid: target.advancePaid || target.total || 0, balance: target.balance || 0
                    };
                    window.generateThermalPrint(printData);
                    return { text: `Pulling bill for **${target.customerName}**... 📄` };
                } else if (!target) {
                    msg?.insertAdjacentHTML('beforeend', `<div class="text-center p-2 text-amber-500 text-[9px] font-black uppercase">Record Not Found</div>`);
                }
                break;

            case 'sendWhatsApp':
                const sanitize = window.sanitizePhone || (p => String(p).replace(/\D/g, ''));
                const phone = sanitize(json.params.phone);
                const text = json.params.message;
                if (phone && text) {
                    window.open(`https://wa.me/${phone.length === 10 ? '91' + phone : phone}?text=${encodeURIComponent(text)}`, '_blank');
                    msg?.insertAdjacentHTML('beforeend', `<div class="text-center p-2 text-emerald-500 text-[9px] font-black uppercase">WhatsApp Dispatching... ✅</div>`);
                    return { text: "WhatsApp message loaded." };
                }
                break;

            case 'viewLastReceipt': {
                const latest = (state.sales || []).reduce((best, s) => toTimestamp(s.date) > toTimestamp(best?.date) ? s : best, null);
                if (latest && window.viewReceipt) window.viewReceipt(latest.id);
                return { text: "Opening latest transaction receipt... 📄" };
            }
            case 'printLast': {
                const lastBill = (state.sales || []).reduce((best, s) => toTimestamp(s.date) > toTimestamp(best?.date) ? s : best, null);
                if (lastBill && window.printReceipt) window.printReceipt(lastBill);
                return { text: "Printing latest sales record... 🖨️" };
            }
            case 'gotoDashboard': return { text: "Navigating to **Dashboard**... 🗺️", navigate: 'index.html' };
            case 'gotoPOS': return { text: "Opening **Retail POS**... 🛒", navigate: 'pos.html' };
            case 'gotoTailoring': return { text: "Switching to **Tracker**... 🧵", navigate: 'tailoring.html' };
        }
    }

    // === LOCAL HANDLERS ===
    async function executeLocal(action, text) {
        const state = window.erpState;
        const nowStr = new Date().toISOString().split('T')[0];

        switch (action) {
            case 'help': 
                return { text: `**Lily v2.5.1 Ultimate** 🌸\n\n• Reports: *"Audit today"* \n• Messaging: *"Message Zubaida"* \n• Printing: *"Print B-105"* \n• Inventory: *"Stock Kurti"* \n• Navigation: *"Go to dashboard"*` };
            
            case 'printSpecificReceipt': {
                const query = text.toLowerCase().replace(/print receipt for|bill for|receipt for/gi, '').trim();
                const target = (state.orders || []).concat(state.sales || []).find(o => 
                    (o.billNo && o.billNo.toLowerCase() === query) || (o.customerName && o.customerName.toLowerCase().includes(query))
                );
                if (target) return await executeAction({ action: 'printSpecificReceipt', params: { billNo: target.billNo } });
                return null;
            }

            case 'todayReport': {
                const filter = (arr) => arr.filter(x => (typeof x.date === 'string' ? x.date : new Date(toTimestamp(x.date)).toISOString().split('T')[0]) === nowStr);
                const sales = filter(state.sales || []);
                const exps = filter(state.expenses || []);
                const rev = sales.reduce((a, s) => a + (parseFloat(s.total) || 0), 0);
                const cost = exps.reduce((a, e) => a + (parseFloat(e.amount) || 0), 0);
                return { text: `**Daily Boutique Audit** 📑\n\n• Sales Rev: **${fmt(rev)}**\n• Expenses: **${fmt(cost)}**\n• Net Today: **${rev >= cost ? `📈 +${fmt(rev-cost)}` : `📉 -${fmt(cost-rev)}`}**` };
            }

            case 'checkStock': {
                const name = parseItemName(text);
                const matches = (state.items || []).filter(i => (i.name && i.name.toLowerCase().includes(name)) || (i.sku && i.sku.toLowerCase() === name));
                if (!matches.length) return null;
                return { text: `**Inventory for "${esc(name)}"**:\n` + matches.slice(0, 5).map(i => `📦 **${esc(i.name)}**: ${i.stock ?? i.quantity ?? 0} left (${fmt(i.sellingPrice ?? i.price)})`).join('\n') };
            }

            case 'pendingDues': {
                const total = (state.sales || []).reduce((acc, s) => acc + (parseFloat(s.balanceDue || 0)), 0);
                const tBal = (state.orders || []).filter(o => o.status !== 'Delivered').reduce((acc, o) => acc + ((o.totalCost||0)-(o.advancePaid||0)), 0);
                return { text: `💰 **Outstanding Book Balance**:\n• Retail Dues: ${fmt(total)}\n• Stitching Dues: ${fmt(tBal)}\n\n**Total: ${fmt(total+tBal)}**` };
            }

            case 'gotoDashboard': case 'gotoPOS': case 'gotoTailoring': return await executeAction({ action });
            default: return null;
        }
    }

    // === UI ===
    function formatMarkdown(text) {
        if (!text) return "";
        let safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');
    }

    window.copyChatText = function (btn) {
        const bubble = btn.closest('.chat-bubble');
        const clone = bubble.cloneNode(true);
        clone.querySelector('.chat-copy-btn')?.remove();
        navigator.clipboard.writeText(clone.innerText.trim()).then(() => {
            const old = btn.innerHTML; btn.innerHTML = '<i data-lucide="check" class="w-3 h-3 text-emerald-500"></i>';
            if (window.lucide) lucide.createIcons();
            setTimeout(() => { btn.innerHTML = old; if (window.lucide) lucide.createIcons(); }, 2000);
        });
    };

    window.closeChatbot = () => { const o = document.getElementById('chatbot-overlay'); if (o) o.remove(); };

    window.openChatbot = function () {
        if (document.getElementById('chatbot-overlay')) return;
        const overlay = document.createElement('div'); overlay.id = 'chatbot-overlay'; overlay.className = "fixed inset-0 z-[8999]";
        overlay.innerHTML = `
            <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onclick="window.closeChatbot()"></div>
            <div class="fixed inset-0 lg:inset-auto lg:bottom-10 lg:right-10 z-[9000] flex flex-col items-center lg:items-end p-4 lg:p-0 pointer-events-none">
                <div id="chatbot-window" onclick="event.stopPropagation()" class="bg-white w-full h-full lg:w-[440px] lg:h-[720px] lg:rounded-[40px] shadow-2xl flex flex-col overflow-hidden animate-pop-in pointer-events-auto border-0 lg:border border-slate-100">
                    <div class="bg-slate-950 p-6 lg:p-8 flex items-center gap-4 shrink-0 shrink-0 relative">
                        <div class="w-12 h-12 bg-gradient-to-tr from-violet-600 to-indigo-500 rounded-2xl flex items-center justify-center relative">
                            <span class="font-black text-white text-xl">L</span>
                            <div class="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-500 border-2 border-slate-950 rounded-full"></div>
                        </div>
                        <div class="flex-1 text-white">
                            <h3 class="font-black text-sm lg:text-base uppercase tracking-tight opacity-90 leading-none mb-1">Lily AI</h3>
                            <div class="flex items-center gap-1.5">
                                <span class="text-emerald-400 text-[8px] font-black uppercase tracking-[0.2em] animate-pulse">Live</span>
                                <span class="text-slate-500 text-[8px] font-bold uppercase leading-none">• v2.5.1 Ultimate</span>
                            </div>
                        </div>
                        <button onclick="window.closeChatbot()" class="w-10 h-10 flex items-center justify-center text-white/50 hover:text-white transition-all bg-white/5 rounded-xl"><i data-lucide="x" class="w-5 h-5"></i></button>
                    </div>
                    <div id="chat-messages" class="flex-1 overflow-y-auto px-6 py-6 space-y-6 bg-slate-50/20 custom-scrollbar scroll-smooth"></div>
                    <div class="px-6 py-3 flex gap-2 overflow-x-auto no-scrollbar border-t border-slate-50 shrink-0 bg-white">
                        <button onclick="document.getElementById('chat-input').value='Audit Report'; window.sendChatMessage()" class="whitespace-nowrap px-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-[9px] font-black uppercase tracking-widest hover:border-violet-300 transition-all font-mono">Audit</button>
                        <button onclick="document.getElementById('chat-input').value='Stock Kurti'; window.sendChatMessage()" class="whitespace-nowrap px-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-[9px] font-black uppercase tracking-widest font-mono">Stock</button>
                        <button onclick="document.getElementById('chat-input').value='Reminder to '; document.getElementById('chat-input').focus();" class="whitespace-nowrap px-4 py-2.5 bg-emerald-50 border border-emerald-100 rounded-2xl text-[9px] font-black uppercase text-emerald-600 font-mono">WhatsApp</button>
                        <button onclick="document.getElementById('chat-input').value='Print bill B-'; document.getElementById('chat-input').focus();" class="whitespace-nowrap px-4 py-2.5 bg-violet-50 border border-violet-100 rounded-2xl text-[9px] font-black uppercase text-violet-600 font-mono">Print</button>
                    </div>
                    <div class="p-6 bg-white border-t border-slate-100 shrink-0">
                        <div class="flex gap-3 bg-slate-50 p-1.5 rounded-[30px] border border-slate-100 focus-within:bg-white focus-within:ring-4 focus-within:ring-violet-100/50 transition-all">
                            <input id="chat-input" type="text" placeholder="Consult Lily Assistant..." class="flex-1 px-4 py-4 bg-transparent font-bold text-sm outline-none" onkeydown="if(event.key==='Enter')window.sendChatMessage()">
                            <button id="chat-send-btn" onclick="window.sendChatMessage()" class="w-12 h-12 bg-slate-950 text-white rounded-2xl shadow-lg hover:bg-violet-600 active:scale-95 transition-all flex items-center justify-center"><i data-lucide="send" class="w-5 h-5"></i></button>
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

        if (text.length > 500) {
            messages.insertAdjacentHTML('beforeend', `<div class="text-center p-2 text-rose-400 text-[9px] font-black uppercase">Message too long (500 chars max)</div>`);
            input.value = ''; messages.scrollTop = messages.scrollHeight;
            return;
        }

        _processing = true; input.disabled = true; sendBtn.disabled = true; input.value = '';
        _lastUserPrompt = text;
        _chatHistory.push({ role: 'user', text });
        const tid = 'tid-' + Date.now();

        try {
            messages.insertAdjacentHTML('beforeend', `<div class="flex justify-end"><div class="bg-violet-600 text-white p-5 rounded-3xl rounded-tr-none max-w-[85%] shadow-sm text-sm font-semibold leading-relaxed">${esc(text)}</div></div>`);
            messages.scrollTop = messages.scrollHeight;

            messages.insertAdjacentHTML('beforeend', `
                <div id="${tid}" class="flex gap-3">
                    <div class="w-10 h-10 bg-slate-950 border border-slate-100 rounded-2xl flex items-center justify-center text-white text-[10px] font-black shrink-0">L</div>
                    <div class="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex gap-1.5 items-center">
                        <div class="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce"></div>
                        <div class="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style="animation-delay:150ms"></div>
                        <div class="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style="animation-delay:300ms"></div>
                    </div>
                </div>`);
            messages.scrollTop = messages.scrollHeight;

            const AI_ENHANCED = new Set(['sendSmartWhatsApp', null]);
            let resp = null;
            const intent = getLocalIntent(text);

            if (intent && !AI_ENHANCED.has(intent)) resp = await executeLocal(intent, text);
            if (!resp) resp = await callGemini(text);

            if (resp) {
                _chatHistory.push({ role: 'lily', text: resp.text });
                while (_chatHistory.length > 16) _chatHistory.shift();

                const thinking = document.getElementById(tid); if (thinking) thinking.remove();
                
                messages.insertAdjacentHTML('beforeend', `
                    <div class="flex flex-col gap-3 group">
                        <div class="flex gap-3 relative">
                            <div class="w-10 h-10 bg-slate-950 border border-slate-100 rounded-2xl flex items-center justify-center text-white text-xs font-black shrink-0">L</div>
                            <div class="bg-white p-5 rounded-3xl rounded-tl-none border border-slate-100 shadow-sm max-w-[85%] text-sm text-slate-700 leading-relaxed relative chat-bubble">
                                <button onclick="window.copyChatText(this)" class="chat-copy-btn p-1 absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-50 border border-slate-200 rounded text-slate-400"><i data-lucide="copy" class="w-3 h-3"></i></button>
                                ${formatMarkdown(resp.text)}
                            </div>
                        </div>
                    </div>`);
                if (window.lucide) lucide.createIcons(); messages.scrollTop = messages.scrollHeight;
                if (resp.navigate) setTimeout(() => { location.href = resp.navigate; }, 1200);
            }
        } catch (err) {
            console.error(err);
            if(document.getElementById(tid)) document.getElementById(tid).remove();
            if (_chatHistory.length && _chatHistory[_chatHistory.length - 1].role === 'user') _chatHistory.pop();
            messages.insertAdjacentHTML('beforeend', `<div class="text-center p-4 text-rose-500 text-[10px] font-black uppercase">Connection Offline. Using Local Logic.</div>`);
        } finally { _processing = false; input.disabled = false; input.focus(); sendBtn.disabled = false; }
    };

    window.renderChatFAB = function () {
        if (document.getElementById('chat-integrated-btn')) return;
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
