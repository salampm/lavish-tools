
// POS Shared Logic & State Management
(function() {
    // Re-bind helpers for convenience
    const fmt = window.fmt;
    const db = window.FB?.db;

    const DATA_PATH = (col) => {
        if (col === 'clients') return window.FB.root(col);
        return window.FB.collection(col);
    };

    // --- LOYALTY SYSTEM CONSTANTS ---
    window.LOYALTY = {
        TIERS: {
            basic:   { label: 'Basic',   min: 0,      pct: 0.02, color: 'slate' },
            silver:  { label: 'Silver',  min: 25000,  pct: 0.03, color: 'indigo' },
            gold:    { label: 'Gold',    min: 50000,  pct: 0.05, color: 'amber' },
            premium: { label: 'Premium', min: 100000, pct: 0.05, color: 'rose' }
        },
        MIN_REDEMPTION: 500,
        BONUS_THRESHOLD: 10000,
        BONUS_POINTS: 200
    };

    window.getLoyaltyTier = (spent) => {
        if (spent >= LOYALTY.TIERS.premium.min) return 'premium';
        if (spent >= LOYALTY.TIERS.gold.min) return 'gold';
        if (spent >= LOYALTY.TIERS.silver.min) return 'silver';
        return 'basic';
    };

    window.calcPoints = (amount, tierKey) => {
        const tier = LOYALTY.TIERS[tierKey] || LOYALTY.TIERS.basic;
        let points = Math.floor(amount * tier.pct);
        if (amount >= LOYALTY.BONUS_THRESHOLD) points += LOYALTY.BONUS_POINTS;
        return points;
    };

    // --- POS RENDERER ---
    window.renderPOS = function () {
        const cartSubtotal = window.erpState.cart.reduce((a, b) => a + (b.price * b.qty), 0);
        const cartCount = window.erpState.cart.reduce((a, b) => a + b.qty, 0);
        
        // Tab switching within POS
        let content = '';
        switch(window.erpState.tab) {
            case 'pos': content = renderPOSTerminal(); break;
            case 'receipts':
            case 'history': content = renderHistory(); break;
            case 'dues': content = renderPendingDues(); break;
            case 'tickets': content = renderTickets(); break;
            case 'clients': content = renderClients(); break;
            case 'settings': content = renderSettings(); break;
            case 'reports': content = renderMasterReports(); break;
            default: content = renderPOSTerminal();
        }

        return `
        <div class="flex h-full overflow-hidden bg-slate-50 relative">
            <!-- Main Content Area -->
            <div class="flex-1 flex flex-col overflow-hidden">
                ${content}
            </div>

            <!-- Global Cart Panel (Always visible in POS tab on Desktop) -->
            ${window.erpState.tab === 'pos' ? `
                <div class="hidden lg:flex w-96 relative z-20 shadow-[-10px_0_20px_rgba(0,0,0,0.03)] border-l border-slate-100 bg-white flex-col">
                    ${renderCartPanel(cartSubtotal, cartCount)}
                </div>
            ` : ''}

            <!-- Mobile Cart Pill -->
            ${window.erpState.tab === 'pos' ? renderMobileCartPill(cartSubtotal, cartCount) : ''}

            <!-- Mobile Cart Modal -->
            ${window.erpState.mobileCartOpen ? renderMobileCartModal(cartSubtotal, cartCount) : ''}
        </div>
        `;
    };

    function renderPOSTerminal() {
        return `
        <div class="flex-1 flex flex-col p-6 overflow-hidden">
            <div class="flex gap-4 mb-6">
                <div class="relative flex-1">
                    <i data-lucide="search" class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4"></i>
                    <input type="text" id="pos-search-input"
                        oninput="window.erpState.search=this.value; window.filterPOSGrid(this.value);" 
                        placeholder="Search products by name or description..." 
                        class="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 shadow-sm"
                        value="${window.erpState.search || ''}">
                </div>
                <div class="flex gap-2">
                    <select onchange="window.erpState.categoryFilter=this.value; window.renderApp()" class="px-4 py-3 bg-white border border-slate-200 rounded-2xl font-bold text-xs outline-none">
                        <option value="">All Categories</option>
                        ${[...new Set(window.erpState.items.map(i => i.category).filter(Boolean))].map(c => `<option value="${c}" ${window.erpState.categoryFilter === c ? 'selected' : ''}>${c}</option>`).join('')}
                    </select>
                </div>
            </div>

            <div id="posGrid" class="flex-1 overflow-y-auto custom-scrollbar grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4 pb-28 md:pb-6">
                ${window.erpState.items
                    .filter(i => {
                        const cat = window.erpState.categoryFilter;
                        return (!cat || i.category === cat);
                    })
                    .map(it => {
                        const s = (window.erpState.search || '').toLowerCase();
                        const matchQ = !s || it.name.toLowerCase().includes(s) || (it.sku && it.sku.toLowerCase().includes(s));
                        return `
                    <button data-item-sku="${it.sku || ''}" data-item-name="${(it.name || '').replace(/"/g, '&quot;')}" data-item-cat="${it.category || ''}" style="${matchQ ? '' : 'display: none;'}" onclick="window.addCart('${it.sku}')" class="bg-white p-4 md:p-5 rounded-3xl md:rounded-[32px] border border-slate-100 shadow-sm hover:border-violet-500 hover:shadow-xl hover:shadow-violet-500/10 transition-all text-left flex flex-col h-36 md:h-44 relative group">
                        <div class="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity hidden md:block">
                            <i data-lucide="plus-circle" class="w-5 h-5 text-violet-500"></i>
                        </div>
                        <span class="text-[9px] md:text-[10px] font-black uppercase text-slate-400 mb-1 tracking-widest">${it.category || 'GENERAL'}</span>
                        <h3 class="font-bold text-slate-800 text-xs md:text-sm mb-auto line-clamp-2 leading-tight">${it.name}</h3>
                        <div class="mt-2 text-right md:text-left">
                            <p class="text-violet-600 font-black text-base md:text-lg">${fmt(it.sellingPrice)}</p>
                            ${it.stock <= 5 ? `<p class="text-[8px] md:text-[9px] font-black text-rose-500 uppercase mt-1">Low Stock: ${it.stock}</p>` : `<p class="text-[8px] md:text-[9px] font-bold text-slate-400 uppercase mt-1">Stock: ${it.stock}</p>`}
                        </div>
                    </button>
                    `;
                    }).join('')}
            </div>
        </div>
        `;
    }

    function renderCartPanel(subtotal, count) {
        return `
        <div class="flex-1 flex flex-col h-full bg-white">
            <div class="p-5 md:p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h2 class="font-black text-slate-800 uppercase tracking-tighter flex items-center gap-2">
                    <i data-lucide="shopping-bag" class="w-5 h-5 text-violet-600 hidden md:block"></i> Shopping Cart
                </h2>
                <div class="flex items-center gap-3">
                    <span class="bg-violet-600 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg shadow-violet-200">${count} Items</span>
                    <button onclick="window.erpState.mobileCartOpen=false; window.renderApp();" class="lg:hidden w-8 h-8 flex items-center justify-center bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200 transition-colors"><i data-lucide="x" class="w-4 h-4"></i></button>
                </div>
            </div>

            <div class="flex-1 overflow-y-auto p-4 md:p-6 space-y-3 md:space-y-4 custom-scrollbar">
                ${window.erpState.cart.map((it, idx) => `
                    <div class="flex gap-4 p-4 bg-slate-50 border border-slate-100 md:rounded-[24px] rounded-2xl relative group hover:bg-white hover:border-violet-200 transition-all">
                        <div class="flex-1">
                            <h4 class="font-black text-slate-800 text-xs mb-1 line-clamp-1">${it.name}</h4>
                            <div class="flex items-center gap-2 text-[10px] font-bold text-slate-500">
                                <span class="text-violet-600 font-black">${fmt(it.price)}</span>
                                <button onclick="window.openEditCartItemPrice(${idx})" class="text-violet-400 hover:text-violet-600 hover:underline">Edit</button>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <button onclick="window.adjustQty(${idx}, -1)" class="w-7 h-7 md:w-8 md:h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:border-rose-400 hover:text-rose-500 transition-all">-</button>
                            <span class="w-6 text-center font-black text-sm">${it.qty}</span>
                            <button onclick="window.adjustQty(${idx}, 1)" class="w-7 h-7 md:w-8 md:h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:border-emerald-400 hover:text-emerald-500 transition-all">+</button>
                        </div>
                    </div>
                `).join('') || `
                <div class="h-full flex flex-col items-center justify-center text-slate-300 italic opacity-50 px-10 text-center py-20">
                    <div class="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                        <i data-lucide="shopping-bag" class="w-8 h-8"></i>
                    </div>
                    <p class="font-bold uppercase tracking-widest text-[10px]">Your cart is empty</p>
                    <p class="text-[10px] mt-2 normal-case font-medium">Select items to start billing.</p>
                </div>`}
            </div>

            <div class="p-6 md:p-8 bg-slate-50 border-t border-slate-100 space-y-4 h-[auto] shrink-0">
                <div class="space-y-2">
                    <div class="flex justify-between items-center text-slate-400 font-black text-[10px] uppercase tracking-widest">
                        <span>Subtotal</span>
                        <span>${fmt(subtotal)}</span>
                    </div>
                    <div class="flex justify-between items-center text-slate-900 font-black text-xl md:text-2xl tracking-tighter">
                        <span>Total</span>
                        <span>${fmt(subtotal)}</span>
                    </div>
                </div>
                <button onclick="window.openChargeScreen()" class="w-full py-4 md:py-5 bg-violet-600 text-white rounded-[24px] font-black uppercase tracking-[0.2em] text-[11px] shadow-2xl shadow-violet-200 hover:bg-violet-700 transition-all active:scale-95 disabled:opacity-50 disabled:grayscale" ${window.erpState.cart.length === 0 ? 'disabled' : ''}>
                    Complete Charge
                </button>
                <div class="flex gap-2">
                    <button onclick="window.saveTicket()" class="flex-1 py-3 justify-center bg-white border border-slate-200 text-slate-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all">Save Ticket</button>
                    <button onclick="if(confirm('Clear entire cart?')){window.erpState.cart=[]; window.erpState.mobileCartOpen=false; window.renderApp();}" class="px-5 py-3 justify-center bg-rose-50 text-rose-500 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all">Clear</button>
                </div>
            </div>
        </div>
        `;
    }

    function renderMobileCartPill(subtotal, count) {
        if(count === 0) return '';
        return `
        <div class="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] lg:hidden w-[90%] max-w-[400px]">
            <button onclick="window.erpState.mobileCartOpen = true; window.renderApp();" class="w-full flex items-center justify-between bg-slate-900 text-white px-6 py-4 rounded-[24px] font-black text-sm shadow-2xl shadow-slate-900/50 active:scale-95 transition-all outline-none border border-slate-700">
                <div class="flex items-center gap-3">
                    <div class="relative">
                        <i data-lucide="shopping-bag" class="w-5 h-5 text-violet-400"></i>
                        <span class="absolute -top-2 -right-2 bg-violet-600 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-full shadow-md leading-none">${count}</span>
                    </div>
                    <span class="text-xs uppercase tracking-widest font-black text-slate-300">View Cart</span>
                </div>
                <span class="text-lg text-emerald-400">${fmt(subtotal)}</span>
            </button>
        </div>
        `;
    }

    function renderMobileCartModal(subtotal, count) {
        return `
        <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex flex-col justify-end lg:hidden animate-fade-in transition-all">
            <div class="absolute inset-0 cursor-pointer" onclick="window.erpState.mobileCartOpen=false; window.renderApp();"></div>
            <div class="bg-white w-full h-[85vh] rounded-t-[40px] shadow-2xl relative overflow-hidden flex flex-col animate-slide-up">
                <div class="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mt-4 mb-2 shrink-0"></div>
                ${renderCartPanel(subtotal, count)}
            </div>
        </div>
        `;
    }

    // --- POS SEARCH (non-destructive — keeps input focus) ---
    window.filterPOSGrid = function(query) {
        const q = (query || '').toLowerCase().trim();
        const cat = window.erpState.categoryFilter || '';
        const grid = document.getElementById('posGrid');
        if (!grid) {
            // Grid not rendered yet — fall back to full render
            window.scheduleRender();
            return;
        }
        grid.querySelectorAll('[data-item-sku]').forEach(function(card) {
            const name = (card.dataset.itemName || '').toLowerCase();
            const sku  = (card.dataset.itemSku  || '').toLowerCase();
            const cardCat = card.dataset.itemCat || '';
            const matchQ   = !q   || name.includes(q) || sku.includes(q);
            const matchCat = !cat || cardCat === cat;
            card.style.display = (matchQ && matchCat) ? '' : 'none';
        });
    };

    // --- POS ACTIONS ---

    window.addCart = function (sku, bypassDye = false) {
        const it = window.erpState.items.find(x => x.sku === sku);
        if (!it) return;

        // Custom workflows for special items
        if (!bypassDye && (it.category === 'DYE' || it.name.toLowerCase().includes('dye-work'))) {
            return window.openDyeModal(it);
        }
        if (!bypassDye && (
            (it.category || '').toUpperCase() === 'STITCHING' || 
            (it.category || '').toUpperCase() === 'TAILORING' || 
            (it.name || '').toLowerCase().includes('stitch') || 
            (it.name || '').toLowerCase().includes('tailor')
        )) {
            return window.openStitchingModal(it);
        }

        // Logic for variable price items (price 0 items)
        if (it.sellingPrice === 0) {
            const modal = document.createElement("div");
            modal.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[500] p-4";
            modal.innerHTML = `
                <div class="bg-white w-full max-w-xs rounded-[32px] p-8 shadow-2xl animate-pop-in">
                    <h3 class="text-lg font-black text-slate-800 mb-2">${it.name}</h3>
                    <p class="text-xs text-slate-500 font-bold mb-6">Variable price item. Enter selling price:</p>
                    <input id="v_price" type="number" placeholder="₹ Amount" class="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xl mb-6 outline-none focus:border-violet-500">
                    <div class="flex gap-3">
                        <button onclick="this.closest('.fixed').remove()" class="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-bold uppercase text-xs tracking-widest">Cancel</button>
                        <button id="v_ok" class="flex-1 py-4 bg-violet-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg shadow-violet-200">Add to Cart</button>
                    </div>
                </div>`;
            document.body.appendChild(modal);
            document.getElementById('v_price').focus();
            document.getElementById('v_ok').onclick = () => {
                const p = parseFloat(document.getElementById('v_price').value || 0);
                if (p <= 0) return alert("Enter valid price");
                window.erpState.cart.push({ ...it, price: p, qty: 1, cost: it.costPrice });
                modal.remove();
                window.renderApp();
            };
            return;
        }

        const existing = window.erpState.cart.find(x => x.sku === sku);
        if (existing) {
            existing.qty++;
        } else {
            window.erpState.cart.push({ sku: it.sku, id: it.id, name: it.name, price: it.sellingPrice, cost: it.costPrice, qty: 1 });
        }
        window.scheduleRender();
    };

    window.adjustQty = function (idx, delta) {
        const item = window.erpState.cart[idx];
        item.qty += delta;
        if (item.qty <= 0) window.erpState.cart.splice(idx, 1);
        window.scheduleRender();
    };

    window.openEditCartItemPrice = function(idx) {
        const item = window.erpState.cart[idx];
        const newPrice = prompt(`Edit price for ${item.name}:`, item.price);
        if (newPrice !== null) {
            const p = parseFloat(newPrice);
            if (!isNaN(p) && p >= 0) {
                item.price = p;
                window.renderApp();
            }
        }
    };

    // --- REVENUE TRACKERS ---
    function renderHistory() {
        const salesList = (window.erpState.sales || [])
            .filter(s => (s.balanceDue || 0) <= 0) // Only show settled in history
            .map(s => {
                const dt = s.createdAt?.toMillis ? s.createdAt.toMillis() : (typeof s.createdAt === 'number' ? s.createdAt : new Date(s.date || Date.now()).getTime());
                return {
                    ...s,
                    _type: 'sale',
                    _sortDate: dt,
                    _displayDate: window.fmtDate(dt),
                    _orderDate: s.date ? window.fmtDate(s.date) : window.fmtDate(dt),
                    _balance: s.balanceDue || 0
                };
            });

        const ordersList = (window.erpState.orders || [])
            .filter(o => o.status === 'Delivered' && ((o.totalCost || 0) - (o.advancePaid || 0) - (o.deliveryDiscount || 0)) <= 0) // Only show delivered AND settled in history
            .map(o => {
                const dt = o.createdAt?.toMillis ? o.createdAt.toMillis() : (typeof o.createdAt === 'number' ? o.createdAt : (o.timestamp || Date.now()));
                const bal = Math.max(0, (o.totalCost || 0) - (o.advancePaid || 0) - (o.deliveryDiscount || 0));
                return {
                    ...o,
                    _type: 'order',
                    _sortDate: dt,
                    _displayDate: o.deliveryDate ? window.fmtDate(o.deliveryDate) : '-',
                    _orderDate: window.fmtDate(o.orderDate || dt),
                    customerPhone: o.phone,
                    _balance: bal
                };
            });

        const sortOrder = window.erpState.historySort || 'desc';
        const sortKey = window.erpState.historySortKey || 'date';

        let list = [...salesList, ...ordersList].sort((a,b) => {
            if (sortKey === 'balance') {
                return sortOrder === 'desc' ? b._balance - a._balance : a._balance - b._balance;
            }
            if (sortKey === 'bill') {
                const numA = parseInt((a.billNo || '').replace(/\D/g, '')) || 0;
                const numB = parseInt((b.billNo || '').replace(/\D/g, '')) || 0;
                return sortOrder === 'desc' ? numB - numA : numA - numB;
            }
            return sortOrder === 'desc' ? b._sortDate - a._sortDate : a._sortDate - b._sortDate;
        });
        
        const filter = window.erpState.historyFilter || 'all';
        const startOfToday = new Date().setHours(0,0,0,0);
        
        if (filter === 'today') {
            list = list.filter(l => l._sortDate >= startOfToday);
        } else if (filter === 'week') {
            const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
            list = list.filter(l => l._sortDate >= weekAgo);
        } else if (filter === 'month') {
            const monthAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
            list = list.filter(l => l._sortDate >= monthAgo);
        }

        if (window.erpState.historySearch) {
            const q = window.erpState.historySearch.toLowerCase();
            list = list.filter(l => 
                (l.billNo || '').toLowerCase().includes(q) || 
                (l.customerName || '').toLowerCase().includes(q) || 
                (l.customerPhone || '').toLowerCase().includes(q)
            );
        }

        return `
        <div class="flex flex-col h-full bg-slate-50">
            <header class="h-24 bg-white border-b border-slate-100 px-8 flex items-center justify-between z-40 sticky top-0 shadow-sm">
                <div>
                    <h2 class="text-xl font-black text-slate-800 uppercase tracking-tight">Receipts Ledger <span class="text-violet-600">v3.0</span></h2>
                    <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Unified Sales & Tailoring Archive</p>
                </div>
                <div class="flex items-center gap-4">
                    <div class="flex bg-slate-100 p-1 rounded-2xl shrink-0">
                        ${['all', 'today', 'week', 'month'].map(f => `
                            <button onclick="window.erpState.historyFilter='${f}'; window.renderApp();" class="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filter === f ? 'bg-white text-violet-600 shadow-md ring-1 ring-black/5' : 'text-slate-400 hover:text-slate-600'}">${f}</button>
                        `).join('')}
                    </div>
                    <div class="h-10 w-px bg-slate-200 mx-2"></div>
                    <div class="flex items-center gap-2">
                        <select onchange="window.erpState.historySortKey=this.value; window.renderApp()" class="px-4 py-2.5 bg-slate-50 border-none rounded-xl text-[10px] font-black uppercase tracking-widest outline-none focus:ring-2 focus:ring-violet-400">
                            <option value="date" ${sortKey === 'date' ? 'selected' : ''}>Sort: Date</option>
                            <option value="balance" ${sortKey === 'balance' ? 'selected' : ''}>Sort: Balance</option>
                            <option value="bill" ${sortKey === 'bill' ? 'selected' : ''}>Sort: Bill No</option>
                        </select>
                        <button onclick="window.toggleHistorySort()" class="w-10 h-10 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center hover:bg-slate-100 transition-all shadow-sm">
                            <i data-lucide="${window.erpState.historySort === 'desc' ? 'sort-desc' : 'sort-asc'}" class="w-4 h-4 text-violet-600"></i>
                        </button>
                    </div>
                    <div class="relative">
                        <i data-lucide="search" class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"></i>
                        <input type="text" oninput="window.erpState.historySearch=this.value; window.scheduleRender()" value="${window.erpState.historySearch || ''}" placeholder="Search..." class="pl-11 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-xs font-bold w-48 outline-none focus:ring-2 focus:ring-violet-400 transition-all">
                    </div>
                </div>
            </header>

            <div class="flex-1 overflow-y-auto px-4 md:px-8 pb-4 md:pb-8 custom-scrollbar">
                <div class="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-visible flex flex-col max-w-[1400px] mx-auto">
                    <div class="sticky top-0 z-30 bg-slate-50/95 backdrop-blur-md border-b border-slate-100 px-8 py-5 hidden md:grid grid-cols-[140px_120px_1fr_250px_90px_90px] gap-4 items-center uppercase tracking-[0.2em] text-[10px] font-black text-slate-400 border-l-4 border-transparent">
                        <div>Bill & Group</div>
                        <div>Date</div>
                        <div>Customer Info</div>
                        <div>Items / Progress</div>
                        <div class="text-right">Total</div>
                        <div class="text-right">Balance</div>
                    </div>

                    <div class="divide-y divide-slate-50">
                        ${list.length === 0 ? `<div class="py-24 text-center text-slate-300 font-bold italic uppercase tracking-widest text-[10px]">No records match your filters</div>` :
                            list.map(s => {
                                const isRefund = s.refunded || (s.refundLog && s.refundLog.length > 0);
                                const itemNames = (s.items || []).map(i => i.name).join(", ");
                                const bal = s._balance;
                                return `
                                <div onclick="${s._type === 'sale' ? `window.openReceipt('${s.id}')` : `location.href='tailoring.html?viewOrder=${s.id}'`}" class="px-8 py-5 grid grid-cols-2 md:grid-cols-[140px_120px_1fr_250px_90px_90px] gap-4 items-center hover:bg-violet-50/30 cursor-pointer transition-all group border-l-4 border-transparent hover:border-violet-500">
                                    <div class="flex flex-col">
                                        <div class="flex items-center gap-2 mb-1">
                                            <p class="text-base font-black text-slate-800 leading-tight group-hover:text-violet-600 transition-all">${s.billNo || 'INV-000'}</p>
                                            <span class="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${s._type === 'sale' ? 'bg-indigo-50 text-indigo-500' : 'bg-emerald-50 text-emerald-600'}">
                                                ${s._type === 'sale' ? 'POS' : 'TLR'}
                                            </span>
                                        </div>
                                        ${isRefund ? '<span class="w-fit px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-[7px] font-black uppercase tracking-tighter">Refunded Case</span>' : ''}
                                    </div>
                                    <div class="flex flex-col">
                                        <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest">${s._orderDate}</p>
                                    </div>
                                    <div class="min-w-0">
                                        <p class="text-sm font-black text-slate-700 capitalize truncate mb-1">${s.customerName || 'Walk-in Client'}</p>
                                        <p class="text-[10px] font-bold text-slate-400 truncate tracking-tight">${s.customerPhone || '-'}</p>
                                    </div>
                                    <div class="min-w-0">
                                        <p class="text-[10px] font-bold text-slate-600 line-clamp-1 leading-tight uppercase mb-1">${itemNames || 'Service Rendered'}</p>
                                        <div class="flex items-center gap-2">
                                            <span class="px-2 py-0.5 bg-slate-50 text-slate-400 rounded-full text-[8px] font-black uppercase tracking-widest">${(s.items || []).length} units</span>
                                            ${s.status ? `<span class="px-2 py-0.5 bg-violet-50 text-violet-400 rounded-full text-[8px] font-black uppercase tracking-widest">${s.status}</span>` : ''}
                                        </div>
                                    </div>
                                    <div class="text-right">
                                        <p class="text-sm font-black text-slate-800">${fmt(s.total || s.totalCost)}</p>
                                    </div>
                                    <div class="text-right">
                                        ${bal > 0 
                                            ? `<span class="px-3 py-1 bg-rose-50 text-rose-500 rounded-lg text-[11px] font-black tracking-tighter shadow-sm">${fmt(bal)}</span>` 
                                            : `<span class="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[11px] font-black tracking-tighter shadow-sm">SETTLED</span>`
                                        }
                                    </div>
                                </div>`;
                            }).join('')
                        }
                    </div>
                </div>
            </div>
        </div>
        `;
    }

    function renderPendingDues() {
        const dueSearch = (window.erpState.dueSearch || '').toLowerCase();
        
        const posDues = (window.erpState.sales || [])
            .filter(s => (s.balanceDue || 0) > 0)
            .map(s => ({
                ...s,
                _type: 'sale',
                _balance: s.balanceDue,
                _displayDate: s.date ? new Date(s.date).toLocaleDateString() : '-'
            }));

        const tailorDues = (window.erpState.orders || [])
            .map(o => {
                const bal = (o.totalCost || 0) - (o.advancePaid || 0) - (o.deliveryDiscount || 0);
                return { ...o, _balance: bal };
            })
            .filter(o => o._balance > 0)
            .map(o => ({
                ...o,
                _type: 'order',
                _displayDate: window.fmtDate(o.orderDate || o.timestamp)
            }));

        let list = [...posDues, ...tailorDues]
            .filter(s => !dueSearch || (s.billNo || '').toLowerCase().includes(dueSearch) || (s.customerPhone || '').includes(dueSearch) || (s.customerName || '').toLowerCase().includes(dueSearch))
            .sort((a,b) => b._balance - a._balance);

        return `
        <div class="flex flex-col h-full bg-slate-50">
            <div class="sticky top-0 z-10 bg-white/80 backdrop-blur-md p-6 border-b border-slate-200">
                <div class="max-w-4xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <h2 class="text-2xl font-black text-slate-800 tracking-tighter uppercase mb-1">Accounts Receivable</h2>
                        <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">${list.length} Outstanding Invoices</p>
                    </div>
                    <div class="flex-1 relative max-w-md">
                        <i data-lucide="search" class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4"></i>
                        <input type="text" placeholder="Search by Bill No or Client Phone..." value="${window.erpState.dueSearch || ''}" class="w-full pl-11 pr-4 py-3 bg-slate-100 border-none rounded-2xl text-xs font-bold focus:ring-2 focus:ring-violet-400" oninput="window.erpState.dueSearch=this.value; window.scheduleRender()">
                    </div>
                </div>
            </div>

            <div class="flex-1 overflow-y-auto px-6 md:px-8 pb-6 md:pb-8 custom-scrollbar">
                <div class="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden flex flex-col max-w-4xl mx-auto">
                    <div class="sticky top-0 z-30 bg-slate-50/95 backdrop-blur-md border-b border-slate-100 px-8 py-4 hidden md:grid grid-cols-[140px_1fr_140px] gap-4 items-center uppercase tracking-[0.2em] text-[10px] font-black text-slate-400">
                        <div>Bill Details</div>
                        <div>Customer Info</div>
                        <div class="text-right">Balance Due</div>
                    </div>

                    <div class="divide-y divide-slate-50">
                        ${list.length === 0 ? `<div class="py-24 text-center text-slate-300 font-bold italic">No pending dues found.</div>` :
                            list.map(s => `
                                <div onclick="${s._type === 'sale' ? `window.openReceipt('${s.id}')` : `location.href='tailoring.html?viewOrder=${s.id}'`}" class="px-8 py-5 grid grid-cols-2 md:grid-cols-[140px_1fr_140px] gap-x-4 gap-y-2 items-center hover:bg-slate-50/50 cursor-pointer transition-colors group">
                                    <div>
                                        <div class="flex items-center gap-2">
                                            <p class="text-base font-black text-slate-800 leading-tight group-hover:text-rose-600 transition-colors">${s.billNo}</p>
                                            <span class="px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest ${s._type === 'sale' ? 'bg-indigo-50 text-indigo-500' : 'bg-emerald-50 text-emerald-600'}">
                                                ${s._type === 'sale' ? 'POS' : 'TLR'}
                                            </span>
                                        </div>
                                        <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">${s._displayDate}</p>
                                    </div>
                                    <div class="min-w-0">
                                        <p class="text-sm font-black text-slate-700 capitalize truncate">${s.customerName || 'Client'}</p>
                                        <p class="text-[10px] font-bold text-slate-400">${s.customerPhone || '-'}</p>
                                    </div>
                                    <div class="text-right text-lg font-black text-rose-600 tracking-tighter">${fmt(s._balance)}</div>
                                </div>`).join('')
                        }
                    </div>
                </div>
            </div>
        </div>
        `;
    }

    function renderClients() {
        const search = (window.erpState.clientSearch || '').toLowerCase();
        // Strict database filtering - ensure we are only showing verified Firebase records
        const list = (window.erpState.clients || [])
            .filter(c => c.phone && (!search || (c.name || '').toLowerCase().includes(search) || c.phone.includes(search)))
            .sort((a,b) => (a.name || 'Anonymous').localeCompare(b.name || 'Anonymous'));

        return `
        <div class="flex flex-col h-full bg-slate-50/50">
            <!-- Client Directory Header -->
            <div class="sticky top-0 z-20 bg-white/70 backdrop-blur-xl p-8 border-b border-slate-200/60">
                <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-8 max-w-[1400px] mx-auto">
                    <div>
                        <div class="flex items-center gap-2 mb-1">
                            <span class="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
                            <h2 class="text-3xl font-black text-slate-900 tracking-tighter uppercase">Client Intelligence</h2>
                        </div>
                        <p class="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">${list.length} Verified Partners</p>
                    </div>

                    <div class="flex flex-1 items-center gap-4 max-w-2xl">
                        <div class="group relative flex-1">
                            <i data-lucide="search" class="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 group-focus-within:text-indigo-500 transition-colors"></i>
                            <input type="text" 
                                placeholder="Search by name, digits or history..." 
                                value="${window.erpState.clientSearch || ''}" 
                                class="w-full pl-14 pr-6 py-4 bg-white border border-slate-200 rounded-[28px] text-sm font-bold shadow-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all" 
                                oninput="window.erpState.clientSearch=this.value; window.scheduleRender()">
                        </div>
                        <button onclick="window.openAddClient()" class="bg-indigo-600 text-white px-8 py-4 rounded-[28px] font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-indigo-100 hover:bg-slate-900 hover:-translate-y-0.5 transition-all active:scale-95 flex items-center gap-3">
                            <i data-lucide="user-plus" class="w-4 h-4"></i> New Record
                        </button>
                    </div>
                </div>
            </div>

            <!-- Client Grid -->
            <div class="flex-1 overflow-y-auto p-8 custom-scrollbar">
                <div class="max-w-[1400px] mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    ${list.map(c => `
                        <div class="bg-white p-8 rounded-[48px] border border-slate-100 shadow-sm hover:shadow-2xl hover:shadow-indigo-500/10 hover:border-indigo-200 transition-all group cursor-pointer relative overflow-hidden">
                            <div class="absolute -right-6 -top-6 w-24 h-24 bg-slate-50 rounded-full group-hover:bg-indigo-50 transition-colors duration-500"></div>
                            
                            <div class="flex items-center gap-5 mb-8 relative z-10">
                                <div class="w-16 h-16 rounded-[24px] bg-slate-900 text-white flex items-center justify-center font-black text-2xl shadow-xl group-hover:bg-indigo-600 transition-colors duration-500">
                                    ${c.name ? c.name.charAt(0).toUpperCase() : '?'}
                                </div>
                                <div class="min-w-0">
                                    <h4 class="font-black text-slate-800 text-lg truncate uppercase tracking-tight leading-none mb-2">${c.name || 'Legacy Client'}</h4>
                                    <div class="flex items-center gap-1.5 opacity-60">
                                        <i data-lucide="phone" class="w-3 h-3 text-indigo-500"></i>
                                        <p class="text-[11px] font-black font-mono tracking-wider">${c.phone}</p>
                                    </div>
                                </div>
                            </div>

                            <div class="grid grid-cols-2 gap-4 pt-6 border-t border-slate-50 relative z-10">
                                <button onclick="window.shareWhatsApp('', '${c.name}', '${c.phone}', 0)" class="py-3 bg-emerald-50 text-emerald-600 rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all flex items-center justify-center gap-2">
                                    <i data-lucide="message-circle" class="w-4 h-4"></i> Broadcast
                                </button>
                                <button onclick="window.openClientProfile('${c.id}')" class="py-3 bg-slate-50 text-slate-500 rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all flex items-center justify-center gap-2">
                                    <i data-lucide="external-link" class="w-4 h-4"></i> Profile
                                </button>
                            </div>
                        </div>
                    `).join('')}
                    
                    ${list.length === 0 ? `
                        <div class="col-span-full py-32 flex flex-col items-center justify-center text-center opacity-30">
                            <i data-lucide="users" class="w-20 h-20 mb-6 text-slate-300"></i>
                            <p class="font-black text-2xl text-slate-800 tracking-tighter uppercase">No Records Found</p>
                            <p class="text-sm font-bold text-slate-400 mt-2">Try adjusting your filters or add a new boutique partner.</p>
                        </div>
                    ` : ''}
                </div>
            </div>
        </div>
        `;
    }

    window.openAddClient = function() {
        const modal = document.createElement("div");
        modal.className = "fixed inset-0 bg-slate-900/80 backdrop-blur-xl flex justify-center items-center z-[500] p-4";
        modal.innerHTML = `
            <div class="bg-white w-full max-w-sm rounded-[56px] p-12 shadow-2xl animate-pop-in relative overflow-hidden">
                <div class="absolute -right-10 -top-10 w-48 h-48 bg-indigo-50 rounded-full blur-3xl pointer-events-none opacity-50"></div>
                <div class="mb-10 text-center relative">
                    <h2 class="text-3xl font-black text-slate-900 tracking-tighter uppercase mb-2">New Partner</h2>
                    <p class="text-[10px] font-black text-indigo-500 uppercase tracking-[0.3em]">Registering Database Record</p>
                </div>
                
                <div class="space-y-6 relative">
                    <div class="space-y-1.5">
                        <label class="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] pl-2">Full Name</label>
                        <input id="nc_name" placeholder="E.g. Arjun Kapoor" class="w-full px-6 py-5 bg-slate-50 border-none rounded-[28px] font-black text-sm outline-none focus:ring-4 focus:ring-indigo-500/10">
                    </div>
                    <div class="space-y-1.5">
                        <label class="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] pl-2">Contact Link (WhatsApp)</label>
                        <input id="nc_phone" type="tel" placeholder="91XXXXXXXXXX" class="w-full px-6 py-5 bg-slate-50 border-none rounded-[28px] font-black text-sm outline-none focus:ring-4 focus:ring-indigo-500/10">
                    </div>

                    <div class="flex gap-4 pt-6">
                        <button onclick="this.closest('.fixed').remove()" class="flex-1 py-5 bg-slate-100 text-slate-400 rounded-[28px] font-black uppercase text-[10px] tracking-widest">Abort</button>
                        <button id="nc_save" class="flex-2 py-5 bg-indigo-600 text-white rounded-[28px] font-black uppercase text-[10px] tracking-[0.2em] shadow-2xl shadow-indigo-200">Sync Record</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modal);
        document.getElementById('nc_save').onclick = async () => {
             const name = document.getElementById('nc_name').value.trim();
             const phone = document.getElementById('nc_phone').value.trim();
             if(!name || !phone) return;
             
             const btn = document.getElementById('nc_save');
             btn.innerHTML = `<i class="w-4 h-4 animate-spin border-2 border-white/20 border-t-white rounded-full"></i> SAVING`;
             btn.disabled = true;

             await DATA_PATH('clients').add({ name, phone, createdAt: Date.now() });
             modal.remove();
             window.renderApp();
        };
    };

    function renderTickets() {
        // ... Logic for saved tickets ...
        return `
        <div class="p-8">
            <h2 class="text-2xl font-black mb-6">Saved Tickets / Tables</h2>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                ${(window.erpState.tickets || []).map((t, idx) => `
                    <div class="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
                        <div class="flex justify-between items-start mb-4">
                            <h3 class="font-black text-lg">${t.customer}</h3>
                            <span class="text-[10px] font-black text-slate-400">${t.time}</span>
                        </div>
                        <div class="space-y-1 mb-6">
                            ${t.items.map(it => `<div class="flex justify-between text-xs font-bold text-slate-500"><span>${it.qty}x ${it.name}</span><span>${fmt(it.price * it.qty)}</span></div>`).join('')}
                        </div>
                        <div class="flex items-center justify-between pt-4 border-t border-slate-50">
                            <span class="text-xl font-black">${fmt(t.total)}</span>
                            <div class="flex gap-2">
                                <button onclick="window.deleteTicket(${idx})" class="w-10 h-10 bg-rose-50 text-rose-500 rounded-xl flex items-center justify-center"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                                <button onclick="window.loadTicket(${idx})" class="px-5 py-2.5 bg-violet-600 text-white rounded-xl text-xs font-black uppercase tracking-widest">Load</button>
                            </div>
                        </div>
                    </div>
                `).join('')}
                ${(window.erpState.tickets || []).length === 0 ? `<div class="col-span-full py-20 text-center text-slate-300 italic">No saved tickets.</div>` : ''}
            </div>
        </div>
        `;
    }

    function renderMasterReports() {
        return `
        <div class="p-8 overflow-y-auto h-full custom-scrollbar">
            <div class="max-w-4xl mx-auto">
                <div class="flex items-center justify-between mb-8">
                    <div>
                        <h2 class="text-3xl font-black text-slate-800 tracking-tighter uppercase flex items-center gap-3">
                            <i data-lucide="file-spreadsheet" class="w-8 h-8 text-emerald-600"></i>
                            Master Analytics Center
                        </h2>
                        <p class="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mt-1">Export high-fidelity business intelligence</p>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                    <div class="bg-white p-10 rounded-[48px] border border-slate-100 shadow-xl shadow-slate-200/20">
                        <h3 class="text-xs font-black uppercase tracking-[0.2em] text-indigo-600 mb-8 flex items-center gap-2">
                             <span class="w-2 h-2 bg-indigo-500 rounded-full"></span> Logic Filter
                        </h3>
                        <div class="grid grid-cols-2 gap-3 mb-8">
                            ${['today', 'weekly', 'monthly', 'all'].map(f => `
                                <button onclick="window.erpState.dashboardFilter='${f}';window.renderApp();" class="py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${window.erpState.dashboardFilter === f ? 'bg-slate-900 text-white shadow-xl scale-[1.02]' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}">${f}</button>
                            `).join('')}
                        </div>
                        
                        <button onclick="window.exportAreaReport('master')" class="w-full py-6 bg-emerald-600 text-white rounded-[28px] font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-emerald-200 hover:bg-emerald-700 transition-all flex items-center justify-center gap-3 active:scale-95 group">
                            <i data-lucide="download" class="w-5 h-5 group-hover:translate-y-0.5 transition-transform"></i>
                            Generate Master XLSX
                        </button>
                    </div>

                    <div class="space-y-4">
                        ${[
                            { id: 'sales', label: 'Sales History', sub: 'Revenue tracking', color: 'emerald', icon: 'shopping-cart' },
                            { id: 'expenses', label: 'Expense Records', sub: 'Burn rate data', color: 'rose', icon: 'wallet' },
                            { id: 'dues', label: 'Pending Dues', sub: 'Credit management', color: 'orange', icon: 'alert-circle' },
                            { id: 'inventory', label: 'Inventory Master', sub: 'Stock auditing', color: 'indigo', icon: 'package' }
                        ].map(r => `
                            <div class="bg-white p-7 rounded-[32px] border border-slate-100 shadow-sm flex items-center justify-between group hover:border-${r.color}-200 hover:shadow-lg transition-all cursor-pointer" onclick="window.exportAreaReport('${r.id}')">
                                <div class="flex items-center gap-5">
                                    <div class="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 group-hover:bg-${r.color}-50 group-hover:text-${r.color}-500 transition-colors">
                                        <i data-lucide="${r.icon}" class="w-5 h-5"></i>
                                    </div>
                                    <div>
                                        <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 group-hover:text-${r.color}-400">${r.sub}</p>
                                        <h4 class="font-black text-slate-800 text-sm tracking-tight">${r.label}</h4>
                                    </div>
                                </div>
                                <i data-lucide="chevron-right" class="w-4 h-4 text-slate-200 group-hover:text-${r.color}-400 group-hover:translate-x-1 transition-all"></i>
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <div class="bg-indigo-600 p-10 rounded-[48px] text-white relative overflow-hidden shadow-2xl shadow-indigo-200">
                    <div class="absolute -right-20 -top-20 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>
                    <div class="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                        <div class="text-center md:text-left">
                            <h3 class="text-2xl font-black tracking-tight mb-2">Audit Synchronization</h3>
                            <p class="text-white/60 text-xs font-bold uppercase tracking-widest">Ensuring database integrity Across all boutique vectors</p>
                        </div>
                        <button onclick="window.exportAreaReport('clients')" class="px-8 py-5 bg-white text-indigo-600 rounded-3xl font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl hover:bg-slate-900 hover:text-white transition-all active:scale-95 flex items-center gap-3">
                             <i data-lucide="users" class="w-4 h-4"></i> Export Client Directory
                        </button>
                    </div>
                </div>
            </div>
        </div>
        `;
    }

    function renderSettings() {
        const section = window.erpState.activeSettingsSection || 'menu';

        // DASHBOARD SETTINGS
        if (section === 'dashboard') {
            const dash = window.erpState.dashboardConfig || {};
            const allWidgets = [
                { id: 'todaySales',       label: "Today's Sales",       icon: 'trending-up',    desc: 'Total revenue generated today' },
                { id: 'pendingDues',      label: 'Pending Dues',         icon: 'clock',          desc: 'Outstanding balance from customers' },
                { id: 'totalSales',       label: 'Total Sales (Month)',   icon: 'bar-chart-2',    desc: 'This month cumulative revenue' },
                { id: 'inventory',        label: 'Inventory Alerts',      icon: 'package',        desc: 'Low stock & inventory overview' },
                { id: 'clientCount',      label: 'Total Clients',         icon: 'users',          desc: 'Registered client database count' },
                { id: 'tailoringPending', label: 'Tailoring Pending',     icon: 'scissors',       desc: 'Orders not yet delivered' },
                { id: 'topItems',         label: 'Top Selling Items',     icon: 'star',           desc: 'Best performing products' },
                { id: 'expenseTracker',   label: 'Expense Tracker',       icon: 'receipt',        desc: "Today's and monthly expenses" },
                { id: 'loyaltyStats',     label: 'Loyalty Overview',      icon: 'gift',           desc: 'Points issued & tier distribution' },
                { id: 'revenueChart',     label: 'Revenue Chart',         icon: 'activity',       desc: 'Weekly revenue trend graph' },
                { id: 'crmInsights',      label: 'CRM Insights',          icon: 'target',         desc: 'Repeat customers & retention rate' },
                { id: 'staffActivity',    label: 'Staff Activity',        icon: 'user-check',     desc: 'Sales per staff member today' },
            ];

            return `
            <div class="flex-1 overflow-y-auto p-10 bg-slate-50 custom-scrollbar">
                <div class="max-w-4xl mx-auto space-y-8 animate-pop-in">
                    <div class="bg-white p-10 rounded-[48px] shadow-sm border border-slate-100">
                        <div class="flex items-center gap-3 mb-8">
                            <div class="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-100">
                                <i data-lucide="layout-dashboard" class="w-6 h-6"></i>
                            </div>
                            <div>
                                <h3 class="text-xl font-black text-slate-900 tracking-tighter uppercase mb-0.5">Dashboard Widgets</h3>
                                <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Toggle which widgets appear on your dashboard</p>
                            </div>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
                            ${allWidgets.map(w => `
                                <div class="flex items-center justify-between p-5 bg-slate-50 rounded-3xl border border-slate-100 hover:border-indigo-200 transition-all">
                                    <div class="flex items-center gap-4">
                                        <div class="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-slate-100">
                                            <i data-lucide="${w.icon}" class="w-4 h-4 text-indigo-500"></i>
                                        </div>
                                        <div>
                                            <p class="font-black text-sm text-slate-800">${w.label}</p>
                                            <p class="text-[9px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">${w.desc}</p>
                                        </div>
                                    </div>
                                    <label class="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
                                        <input type="checkbox" class="sr-only peer" ${dash[w.id] !== false ? 'checked' : ''} onchange="window.toggleDashWidget('${w.id}', this.checked)">
                                        <div class="w-12 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                                    </label>
                                </div>
                            `).join('')}
                        </div>

                        <div class="bg-indigo-50 border border-indigo-100 rounded-3xl p-6 text-center">
                            <p class="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Changes apply instantly · Synced with cloud</p>
                        </div>
                    </div>
                </div>
            </div>`;
        }

        // OVERVIEW MENU
        if (section === 'menu') {
            const menuItems = [
                { id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard', color: 'indigo', sub: 'Widget Visibility' },
                { id: 'printer', label: 'Printer Setup', icon: 'printer', color: 'slate', sub: 'Width & Formatting' },
                { id: 'whatsapp', label: 'WA Templates', icon: 'message-square', color: 'emerald', sub: 'Message Content' },
                { id: 'tax', label: 'Tax Rules', icon: 'hash', color: 'violet', sub: 'GST & Local Taxes' },
                { id: 'discount', label: 'Discounts', icon: 'tag', color: 'rose', sub: 'Global Offers' },
                { id: 'loyalty', label: 'Loyalty', icon: 'star', color: 'amber', sub: 'Rewards & Tiers' },
                { id: 'admin', label: 'Admin', icon: 'shield-check', color: 'indigo', sub: 'Staff & Records' }
            ];

            return `
            <div class="flex-1 overflow-y-auto p-10 bg-slate-50">
                <div class="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    ${menuItems.map(item => `
                        <button onclick="window.erpState.activeSettingsSection='${item.id}'; window.renderApp();" 
                            class="bg-white p-8 rounded-[40px] border-2 border-transparent hover:border-${item.color}-600 transition-all shadow-sm hover:shadow-2xl hover:shadow-${item.color}-500/10 flex flex-col items-center text-center group">
                            <div class="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-${item.color}-50 transition-colors">
                                <i data-lucide="${item.icon}" class="w-8 h-8 text-${item.color}-500 group-hover:scale-110 transition-transform"></i>
                            </div>
                            <h3 class="font-black text-slate-800 text-sm uppercase tracking-tighter mb-1">${item.label}</h3>
                            <p class="text-[8px] font-bold text-slate-400 uppercase tracking-widest">${item.sub}</p>
                        </button>
                    `).join('')}
                </div>
            </div>`;
        }



        // WHATSAPP SECTION
        if (section === 'whatsapp') {
            const templates = window.erpState.whatsappTemplates || {
                booking: '*Lavish Lavender Bridal Boutique* 🌸\n\nHello *{customerName}*,\n\nYour order has been successfully booked.\n\n*Bill No:* {billNo}\n*Total Amount:* Rs.{totalCost}\n*Advance Received:* Rs.{advancePaid}\n*Balance:* Rs.{balance}\n\n*Expected Delivery:* {deliveryDate}\n\nPlease keep this bill number for reference. We appreciate your trust in Lavish Lavender. 🙏',
                ready: '*Lavish Lavender Bridal Boutique* 🌸\n\nHello *{customerName}*,\n\nGood news! Your order is ready for pickup. ✅\n\n*Bill No:* {billNo}\n*Balance Payable:* Rs.{balance}\n\nPlease visit our boutique to collect your order.\n\n*Location:* 📍\nhttps://share.google/iR4s2zrLMHoiTTZ66\n\nWe look forward to seeing you.',
                delivered: '*Lavish Lavender Bridal Boutique* 🌸\n\nHello *{customerName}*,\n\nYour order has been successfully delivered. ✅\n\n*Your Receipt:* 📄\nhttps://www.lavishlavender.in/receipt/?bill={billNo}\n\nThank you for choosing Lavish Lavender. 🙏\n\nIf you were happy with our service, please leave us a 5-star review: ⭐\nhttps://g.page/r/CSDbXBIvElTEEBM/review\n\nVisit again soon!',
                reminder: 'Hi {customerName}, 🌸 This is a friendly reminder from *Lavish Lavender* regarding your bill *{billNo}*.\n\nThere is a pending balance of *{balance}*. You can view your receipt details here: https://www.lavishlavender.in/receipt/?bill={billNo}\n\nWe appreciate your support! 🙏\n\nVisit again soon! 🌸'
            };

            return `
            <div class="flex-1 overflow-y-auto p-10 bg-slate-50 custom-scrollbar">
                <div class="max-w-3xl mx-auto space-y-8 animate-pop-in">
                    <div class="bg-white p-10 rounded-[48px] shadow-sm">
                        <div class="space-y-8 mb-10">
                            ${Object.entries(templates).map(([key, value]) => `
                                <div class="space-y-3">
                                    <div class="flex justify-between items-center px-1">
                                        <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest">${key.replace('_', ' ')} Logic</label>
                                        <span class="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full uppercase">Enabled</span>
                                    </div>
                                    <textarea id="temp_${key}" class="w-full p-6 bg-slate-50 border-none rounded-[32px] font-medium text-sm text-slate-700 min-h-[150px] focus:ring-2 focus:ring-emerald-400 outline-none shadow-inner">${value}</textarea>
                                </div>
                            `).join('')}
                        </div>
                        <button onclick="window.saveTemplates()" class="w-full py-6 bg-emerald-600 text-white rounded-[32px] font-black uppercase text-xs tracking-[0.2em] shadow-2xl shadow-emerald-200 hover:bg-emerald-800 transition-all flex items-center justify-center gap-3 active:scale-95">
                            <i data-lucide="save" class="w-5 h-5"></i>
                            Save Dynamic Templates
                        </button>
                    </div>
                    <div class="bg-indigo-600 p-8 rounded-[40px] text-white/90 shadow-xl shadow-indigo-100">
                        <h4 class="text-[10px] font-black uppercase tracking-[0.2em] mb-4 text-white">Injection Tokens (Placeholders)</h4>
                        <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
                            ${['customerName', 'billNo', 'totalCost', 'advancePaid', 'balance', 'deliveryDate', 'pointsEarned', 'totalPoints', 'tier'].map(t => `
                                <div class="bg-white/10 px-4 py-2 rounded-xl text-[10px] font-mono font-bold">{${t}}</div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>`;
        }

        // TAX SECTION
        if (section === 'tax') {
            return `
            <div class="flex-1 overflow-y-auto p-10 bg-slate-50">
                <div class="max-w-2xl mx-auto space-y-8 animate-pop-in">
                    <div class="bg-white p-10 rounded-[48px] shadow-sm">
                        <div class="flex justify-between items-center mb-6 px-1">
                            <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Establishments GSTIN</h3>
                            <span class="text-[8px] font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded uppercase">Official</span>
                        </div>
                        <div class="flex gap-4">
                            <input id="pc_gstin" value="${window.erpState.gstin || ''}" placeholder="Enter GSTIN Number" class="flex-1 px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-sm outline-none focus:ring-2 focus:ring-indigo-400 shadow-inner">
                            <button onclick="window.updateGSTIN()" class="px-8 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-black transition-all">Update</button>
                        </div>
                    </div>

                    <div class="bg-white p-10 rounded-[48px] shadow-sm">
                        <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 px-1">Create New Rule</h3>
                        <div class="flex gap-4">
                            <input id="new_tax_label" placeholder="e.g. VAT" class="flex-1 px-6 py-4 bg-slate-50 border-none rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-violet-400 shadow-inner">
                            <input id="new_tax_val" type="number" placeholder="%" class="w-24 px-6 py-4 bg-slate-50 border-none rounded-2xl font-bold text-sm text-center outline-none focus:ring-2 focus:ring-violet-400 shadow-inner">
                            <button onclick="window.addTaxRule()" class="px-8 bg-violet-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-violet-700 transition-all shadow-lg shadow-violet-100">Add Rule</button>
                        </div>
                    </div>

                    <div class="space-y-4">
                        ${window.erpState.taxes.map((t, idx) => `
                            <div class="bg-white p-6 rounded-[32px] border border-slate-100 flex justify-between items-center shadow-sm">
                                <div class="flex items-center gap-4">
                                    <div class="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-violet-500 font-black text-xs shadow-inner">${t.val}%</div>
                                    <div>
                                        <p class="font-black text-slate-800 uppercase tracking-tight">${t.label}</p>
                                        <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Active Rate</p>
                                    </div>
                                </div>
                                ${idx !== 0 ? `
                                    <button onclick="window.deleteTaxRule(${idx})" class="p-3 text-rose-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all">
                                        <i data-lucide="trash-2" class="w-5 h-5"></i>
                                    </button>
                                ` : `<span class="bg-slate-50 text-slate-300 px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest">Default</span>`}
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>`;
        }

        // DISCOUNT SECTION
        if (section === 'discount') {
            return `
            <div class="flex-1 overflow-y-auto p-10 bg-slate-50">
                <div class="max-w-2xl mx-auto space-y-8 animate-pop-in">
                    <div class="bg-white p-10 rounded-[48px] shadow-sm">
                        <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 px-1">New Promo Rule</h3>
                        <input id="new_disc_label" placeholder="e.g. Wedding Season Sale" class="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-bold text-sm mb-4 outline-none focus:ring-2 focus:ring-rose-400 shadow-inner">
                        <div class="flex gap-4">
                            <input id="new_disc_val" type="number" placeholder="Value" class="flex-1 px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-xl outline-none focus:ring-2 focus:ring-rose-400 shadow-inner">
                            <select id="new_disc_type" class="w-32 px-6 py-4 bg-slate-50 border-none rounded-2xl font-bold text-sm outline-none shadow-inner">
                                <option value="cash">₹ Cash</option>
                                <option value="pct">% Pct</option>
                            </select>
                            <button onclick="window.addDiscountRule()" class="px-10 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-black transition-all shadow-xl">Save Rule</button>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        ${window.erpState.discounts.map((d, idx) => `
                            <div class="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center justify-between group">
                                <div class="flex items-center gap-4">
                                    <div class="w-14 h-14 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center font-black text-sm shadow-inner">
                                        ${d.type === 'cash' ? '₹' + d.val : d.val + '%'}
                                    </div>
                                    <div>
                                        <p class="font-black text-slate-800 text-sm tracking-tight line-clamp-1 truncate w-32 uppercase">${d.label}</p>
                                        <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Deduction Rule</p>
                                    </div>
                                </div>
                                <button onclick="window.deleteDiscountRule(${idx})" class="p-3 text-slate-200 group-hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all">
                                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                                </button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>`;
        }

        // LOYALTY SECTION
        if (section === 'loyalty') {
            const loyalty = window.erpState.loyalty || { enabled: true, pointsPer100: 5, eliteThreshold: 10000, goldThreshold: 50000 };
            return `
            <div class="flex-1 overflow-y-auto p-10 bg-slate-50">
                <div class="max-w-2xl mx-auto space-y-8 animate-pop-in">
                    <div class="bg-white p-10 rounded-[48px] shadow-sm">
                        <div class="flex items-center gap-3 mb-8">
                            <div class="w-12 h-12 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center font-black">
                                <i data-lucide="star" class="w-6 h-6"></i>
                            </div>
                            <div>
                                <h3 class="text-xl font-black text-slate-900 tracking-tighter uppercase mb-0.5">Loyalty Settings</h3>
                                <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Reward Points & Tiers</p>
                            </div>
                        </div>

                        <div class="space-y-6 mb-10">
                            <div class="flex items-center justify-between bg-slate-50 p-6 rounded-3xl border border-slate-100">
                                <div>
                                    <h4 class="font-black text-sm uppercase text-slate-800">Enable Program</h4>
                                    <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Activate loyalty points</p>
                                </div>
                                <label class="relative inline-flex items-center cursor-pointer">
                                  <input type="checkbox" id="loyalty_enabled" class="sr-only peer" ${loyalty.enabled ? 'checked' : ''}>
                                  <div class="w-14 h-7 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-amber-500"></div>
                                </label>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div class="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                                    <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Basic Pct (%)</label>
                                    <input id="loy_pct_basic" type="number" value="${(loyalty.tiers?.basic?.pct || 0.02) * 100}" class="w-full bg-white border-none rounded-xl px-4 py-2 font-black text-slate-800">
                                </div>
                                <div class="bg-indigo-50 p-6 rounded-3xl border border-indigo-100">
                                    <label class="text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-2">Silver (₹25k+) Pct (%)</label>
                                    <input id="loy_pct_silver" type="number" value="${(loyalty.tiers?.silver?.pct || 0.03) * 100}" class="w-full bg-white border-none rounded-xl px-4 py-2 font-black text-indigo-600">
                                </div>
                                <div class="bg-amber-50 p-6 rounded-3xl border border-amber-100">
                                    <label class="text-[10px] font-black text-amber-500 uppercase tracking-widest block mb-2">Gold (₹50k+) Pct (%)</label>
                                    <input id="loy_pct_gold" type="number" value="${(loyalty.tiers?.gold?.pct || 0.05) * 100}" class="w-full bg-white border-none rounded-xl px-4 py-2 font-black text-amber-600">
                                </div>
                                <div class="bg-rose-50 p-6 rounded-3xl border border-rose-100">
                                    <label class="text-[10px] font-black text-rose-400 uppercase tracking-widest block mb-2">Premium (₹100k+) Pct (%)</label>
                                    <input id="loy_pct_premium" type="number" value="${(loyalty.tiers?.premium?.pct || 0.05) * 100}" class="w-full bg-white border-none rounded-xl px-4 py-2 font-black text-rose-600">
                                </div>
                            </div>

                            <div class="p-6 bg-slate-50 rounded-3xl border border-slate-100 italic">
                               <p class="text-[10px] font-bold text-slate-400 leading-relaxed uppercase tracking-tight">
                                 Note: Bonus +200 points automatically applied for orders over ₹10,000.
                                 Redemption unlocked at 500 points (1 Pt = ₹1).
                               </p>
                            </div>
                        </div>

                        <button onclick="window.saveLoyaltySettings()" class="w-full py-6 bg-slate-900 text-white rounded-[28px] font-black uppercase text-xs tracking-[0.2em] shadow-xl hover:bg-black transition-all active:scale-95 flex items-center justify-center gap-3">
                            <i data-lucide="save" class="w-4 h-4"></i>
                            Save Loyalty Config
                        </button>
                    </div>

                    <div class="bg-indigo-50 border border-indigo-100 p-8 rounded-[40px] text-center">
                        <p class="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-4">Maintenance Zone</p>
                        <h4 class="text-sm font-black text-indigo-900 mb-6 uppercase">Sync Points for all existing sales</h4>
                        <button onclick="window.syncLegacyLoyalty(event)" class="w-full py-5 bg-white border-2 border-indigo-200 text-indigo-600 rounded-[28px] font-black uppercase text-[10px] tracking-[0.2em] shadow-lg hover:bg-indigo-600 hover:text-white transition-all active:scale-95">
                            Recalculate & Migrate Data
                        </button>
                        <p class="text-[9px] text-indigo-400 font-bold mt-4 uppercase tracking-widest px-4 leading-relaxed">This will scan all previous POS & Tailoring orders to correctly set tiers and points for all customers.</p>
                    </div>
                </div>
            </div>`;
        }

        // DASHBOARD SECTION
        if (section === 'dashboard') {
            const dConf = window.erpState.dashboardConfig || { widgets: ['revenue', 'orders', 'inventory', 'loyalty', 'trends', 'crm'] };
            const widgets = [
                { id: 'revenue', label: 'Revenue Overview', icon: 'trending-up' },
                { id: 'orders', label: 'Order Summary', icon: 'shopping-cart' },
                { id: 'inventory', label: 'Inventory Status', icon: 'package' },
                { id: 'loyalty', label: 'Loyalty Program', icon: 'star' },
                { id: 'trends', label: 'Sales Trends', icon: 'activity' },
                { id: 'crm', label: 'Customer Insights', icon: 'users' }
            ];
            return `
            <div class="flex-1 overflow-y-auto p-10 bg-slate-50 custom-scrollbar">
                <div class="max-w-3xl mx-auto space-y-8 animate-pop-in">
                    <div class="bg-white p-10 rounded-[48px] shadow-sm border border-slate-100">
                        <div class="flex items-center gap-3 mb-8">
                            <div class="w-12 h-12 bg-violet-600 text-white rounded-2xl flex items-center justify-center font-black shadow-lg shadow-violet-100">
                                <i data-lucide="layout-dashboard" class="w-6 h-6"></i>
                            </div>
                            <div>
                                <h3 class="text-xl font-black text-slate-900 tracking-tighter uppercase mb-0.5">Dashboard Widgets</h3>
                                <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Customize your view</p>
                            </div>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
                            ${widgets.map(w => `
                                <div class="flex items-center justify-between bg-slate-50 p-6 rounded-3xl border border-slate-100">
                                    <div>
                                        <h4 class="font-black text-sm uppercase text-slate-800">${w.label}</h4>
                                        <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Display on dashboard</p>
                                    </div>
                                    <label class="relative inline-flex items-center cursor-pointer">
                                      <input type="checkbox" id="widget_${w.id}" class="sr-only peer" ${dConf.widgets.includes(w.id) ? 'checked' : ''} onchange="window.toggleWidget('${w.id}')">
                                      <div class="w-14 h-7 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-violet-500"></div>
                                    </label>
                                </div>
                            `).join('')}
                        </div>
                        <p class="text-[9px] text-slate-400 font-bold mt-4 uppercase tracking-widest px-4 leading-relaxed text-center">Changes are saved automatically.</p>
                    </div>
                </div>
            </div>`;
        }

        // PRINTER SECTION
        if (section === 'printer') {
            const pConf = window.erpState.printerConfig || { width: '58', logo: '', header: 'Lavish Lavender', footer: 'Visit Again!', showCustomer: true, showTax: true };
            return `
            <div class="flex-1 overflow-y-auto p-10 bg-slate-50 custom-scrollbar">
                <div class="max-w-3xl mx-auto space-y-8 animate-pop-in">
                    <div class="bg-white p-10 rounded-[48px] shadow-sm border border-slate-100">
                        <div class="flex items-center gap-3 mb-8">
                            <div class="w-12 h-12 bg-emerald-600 text-white rounded-2xl flex items-center justify-center font-black shadow-lg shadow-emerald-100">
                                <i data-lucide="printer" class="w-6 h-6"></i>
                            </div>
                            <div>
                                <h3 class="text-xl font-black text-slate-900 tracking-tighter uppercase mb-0.5">Printer Settings</h3>
                                <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Thermal Receipt Configuration</p>
                            </div>
                        </div>

                        <div class="space-y-6 mb-10">
                            <div class="flex items-center justify-between bg-slate-50 p-6 rounded-3xl border border-slate-100">
                                <div>
                                    <h4 class="font-black text-sm uppercase text-slate-800">Printer Width</h4>
                                    <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Select paper size</p>
                                </div>
                                <select onchange="window.updatePrinterConfig({ width: this.value })" class="px-4 py-2 bg-white border border-slate-200 rounded-xl font-bold text-sm outline-none">
                                    <option value="58" ${pConf.width === '58' ? 'selected' : ''}>58mm</option>
                                    <option value="80" ${pConf.width === '80' ? 'selected' : ''}>80mm</option>
                                </select>
                            </div>

                            <div class="space-y-4">
                                <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Brand Logo</label>
                                <div class="flex gap-4 items-center bg-slate-50 p-4 rounded-2xl border-2 border-slate-100">
                                    <input id="pc_logo" type="text" value="${pConf.logo || ''}" placeholder="Logo URL" class="flex-1 bg-transparent border-none font-black text-sm outline-none">
                                    <div class="h-8 w-px bg-slate-200"></div>
                                    <button onclick="document.getElementById('pc_logo_file').click()" class="px-4 py-2 bg-white text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-slate-200 hover:bg-slate-50 transition-all">Browse</button>
                                    <input type="file" id="pc_logo_file" class="hidden" accept="image/*" onchange="window.handleLogoUpload(this)">
                                </div>
                            </div>
                            <div>
                                <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Shop Name</label>
                                <input id="pc_header" type="text" value="${pConf.header || ''}" placeholder="e.g. Lavish Lavender Boutique" class="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-base outline-none focus:border-emerald-500 shadow-inner">
                            </div>
                            <div>
                                <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Address Details</label>
                                <textarea id="pc_address" rows="2" placeholder="e.g. Uppala, Kasaragod, Kerala" class="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-sm outline-none focus:border-emerald-500 shadow-inner">${pConf.address || ''}</textarea>
                            </div>
                            <div>
                                <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Footer Text</label>
                                <input id="pc_footer" type="text" value="${pConf.footer || ''}" placeholder="e.g. Thank you for your visit!" class="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-base outline-none focus:border-emerald-500 shadow-inner">
                            </div>

                            <div class="flex items-center justify-between bg-slate-50 p-6 rounded-3xl border border-slate-100">
                                <div>
                                    <h4 class="font-black text-sm uppercase text-slate-800">Show Customer Details</h4>
                                    <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Name & Phone on receipt</p>
                                </div>
                                <label class="relative inline-flex items-center cursor-pointer">
                                  <input type="checkbox" id="pc_show_customer" class="sr-only peer" ${pConf.showCustomer ? 'checked' : ''} onchange="window.updatePrinterConfig({ showCustomer: this.checked })">
                                  <div class="w-14 h-7 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-emerald-500"></div>
                                </label>
                            </div>
                            <div class="flex items-center justify-between bg-slate-50 p-6 rounded-3xl border border-slate-100">
                                <div>
                                    <h4 class="font-black text-sm uppercase text-slate-800">Show Tax Breakdown</h4>
                                    <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Display tax amount on receipt</p>
                                </div>
                                <label class="relative inline-flex items-center cursor-pointer">
                                  <input type="checkbox" id="pc_show_tax" class="sr-only peer" ${pConf.showTax ? 'checked' : ''} onchange="window.updatePrinterConfig({ showTax: this.checked })">
                                  <div class="w-14 h-7 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-emerald-500"></div>
                                </label>
                            </div>
                        </div>

                        <button onclick="window.updatePrinterConfig()" class="w-full py-6 bg-slate-900 text-white rounded-[28px] font-black uppercase text-xs tracking-[0.2em] shadow-xl hover:bg-black transition-all active:scale-95 flex items-center justify-center gap-3">
                            <i data-lucide="save" class="w-4 h-4"></i>
                            Save Printer Config
                        </button>
                    </div>

                    <div class="bg-white p-10 rounded-[48px] shadow-sm">
                        <div class="flex justify-between items-center mb-6 px-1">
                            <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Establishments GSTIN</h3>
                            <span class="text-[8px] font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded uppercase">Official</span>
                        </div>
                        <div class="flex gap-4">
                            <input id="pc_gstin" value="${window.erpState.gstin || ''}" placeholder="Enter GSTIN Number" class="flex-1 px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-sm outline-none focus:ring-2 focus:ring-indigo-400 shadow-inner">
                            <button onclick="window.updateGSTIN()" class="px-8 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-black transition-all">Update</button>
                        </div>
                    </div>

                    <!-- Live Receipt Preview -->
                    <div class="bg-white p-10 rounded-[48px] shadow-sm border border-slate-100">
                        <div class="flex items-center gap-3 mb-8">
                            <div class="w-12 h-12 bg-violet-600 text-white rounded-2xl flex items-center justify-center font-black shadow-lg shadow-violet-100">
                                <i data-lucide="eye" class="w-6 h-6"></i>
                            </div>
                            <div>
                                <h3 class="text-xl font-black text-slate-900 tracking-tighter uppercase mb-0.5">Receipt Preview</h3>
                                <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Live thermal template layout</p>
                            </div>
                        </div>

                        <div class="flex justify-center">
                            <div style="width:200px;font-family:monospace;font-size:9px;line-height:1.4;color:#111;border:1px dashed #cbd5e1;border-radius:12px;padding:12px;background:#fafafa;">
                                ${pConf.logo ? `<div style="text-align:center;margin-bottom:6px;"><img src="${pConf.logo}" style="max-width:80px;max-height:40px;"></div>` : `<div style="text-align:center;margin-bottom:4px;border:1px dashed #e2e8f0;border-radius:6px;padding:6px;color:#94a3b8;font-size:8px;">[ Logo Here ]</div>`}
                                <div style="text-align:center;font-weight:bold;font-size:11px;">${pConf.header || 'Shop Name'}</div>
                                ${pConf.address ? pConf.address.split('\n').map(l => `<div style="text-align:center;font-size:8px;color:#555;">${l.trim()}</div>`).join('') : `<div style="text-align:center;font-size:8px;color:#94a3b8;">[ Address ]</div>`}
                                <div style="text-align:center;font-size:7px;color:#888;margin-top:2px;">+91 75580 08881</div>
                                <div style="border-top:1px dashed #ccc;margin:6px 0;"></div>
                                <div style="font-size:8px;">Bill No: B-0001 &nbsp; Date: Today</div>
                                <div style="font-size:8px;">Customer: Walk-in</div>
                                <div style="border-top:1px dashed #ccc;margin:6px 0;"></div>
                                <div style="display:flex;justify-content:space-between;font-size:8px;font-weight:bold;">
                                    <span>Item</span><span>Qty</span><span>Amt</span>
                                </div>
                                <div style="border-top:1px dashed #ccc;margin:3px 0;"></div>
                                <div style="display:flex;justify-content:space-between;font-size:8px;">
                                    <span>Sample Item</span><span>x1</span><span>₹500</span>
                                </div>
                                <div style="border-top:1px dashed #ccc;margin:6px 0;"></div>
                                <div style="display:flex;justify-content:space-between;font-size:8px;">
                                    <span>Subtotal</span><span>₹500</span>
                                </div>
                                <div style="display:flex;justify-content:space-between;font-size:8px;font-weight:bold;">
                                    <span>TOTAL</span><span>₹500</span>
                                </div>
                                <div style="display:flex;justify-content:space-between;font-size:8px;">
                                    <span>Paid</span><span>₹500</span>
                                </div>
                                <div style="border-top:1px dashed #ccc;margin:6px 0;"></div>
                                <div style="text-align:center;font-size:8px;color:#555;">Dry Wash Only, No Exchange, No Refund</div>
                                <div style="text-align:center;font-size:8px;font-style:italic;margin-top:2px;">${pConf.footer || 'Thank you for visiting!'}</div>
                                ${window.erpState.gstin ? `<div style="text-align:center;font-size:7px;color:#888;margin-top:4px;">GSTIN: ${window.erpState.gstin}</div>` : ''}
                            </div>
                        </div>
                        <p class="text-center text-[9px] font-black text-slate-300 uppercase tracking-widest mt-6">Updates when you save · Synced from printer config</p>
                    </div>
                </div>
            </div>`;
        }

        // ADMIN SECTION (REPLACED SECURITY)
        if (section === 'admin') {
            const staff = window.erpState.staff || [];
            const creds = window.erpState.passwords || { staff: 'Lavish1234', owner: 'Swali4783' };
            
            return `
            <div class="flex-1 overflow-y-auto p-10 bg-slate-50 custom-scrollbar">
                <div class="max-w-4xl mx-auto space-y-8 animate-pop-in">
                    <!-- Staff Management -->
                    <div class="bg-white p-10 rounded-[48px] shadow-sm border border-slate-100">
                        <div class="flex items-center justify-between mb-8">
                            <div class="flex items-center gap-3">
                                <div class="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center font-black shadow-lg shadow-indigo-100">
                                    <i data-lucide="users" class="w-6 h-6"></i>
                                </div>
                                <div>
                                    <h3 class="text-xl font-black text-slate-900 tracking-tighter uppercase mb-0.5">Staff & Operations</h3>
                                    <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Management & Commission Logic</p>
                                </div>
                            </div>
                            <button onclick="window.openAddStaff()" class="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-600 transition-all">Enroll Staff</button>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
                            ${staff.map((s, idx) => {
                                const posSales = (window.erpState.sales || []).filter(sv => sv.recordedBy === s.name).reduce((sum, sv) => sum + (sv.total || 0), 0);
                                const tailorSales = (window.erpState.orders || []).filter(ov => ov.recordedBy === s.name || ov.staff === s.name).reduce((sum, ov) => sum + (ov.totalCost || 0), 0);
                                const salesVal = posSales + tailorSales;
                                const bonus = Math.floor(salesVal / 5000) * 100;
                                const commission = (salesVal * 0.02) + bonus;

                                return `
                                <div class="p-6 bg-slate-50 rounded-[32px] border border-slate-100 group relative overflow-hidden">
                                    <div class="flex items-center gap-4 mb-6">
                                        <div class="w-10 h-10 rounded-full bg-white flex items-center justify-center font-black text-indigo-600 shadow-sm">${s.name[0]}</div>
                                        <div class="flex-1">
                                            <p class="font-black text-slate-800 text-xs uppercase">${s.name}</p>
                                            <p class="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Code: ${s.code.replace(/./g, '*')}</p>
                                        </div>
                                        <button onclick="window.deleteStaff(${idx})" class="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                                    </div>
                                    <div class="grid grid-cols-2 gap-3 pt-4 border-t border-slate-100">
                                        <div>
                                            <p class="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Total Sales</p>
                                            <p class="font-black text-slate-800 text-sm">₹${salesVal.toLocaleString('en-IN')}</p>
                                        </div>
                                        <div class="text-right">
                                            <p class="text-[8px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-1">Commission</p>
                                            <p class="font-black text-indigo-600 text-sm">₹${commission.toLocaleString('en-IN')}</p>
                                        </div>
                                    </div>
                                </div>`;
                            }).join('')}
                            ${staff.length === 0 ? `<p class="col-span-full py-10 text-center text-slate-300 italic text-xs uppercase font-black tracking-widest">No staff registered</p>` : ''}
                        </div>

                        <!-- System Security (Owner/Staff Master) -->
                        <div class="pt-8 border-t border-slate-100">
                            <h4 class="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6 mb-8 text-center">— Master Credentials —</h4>
                            <div class="grid grid-cols-2 gap-6 mb-8">
                                <div>
                                    <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Global Staff Pwd</label>
                                    <input id="pass_staff" type="text" value="${creds.staff}" class="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-base outline-none focus:border-indigo-500 shadow-inner">
                                </div>
                                <div>
                                    <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Owner Pwd</label>
                                    <input id="pass_owner" type="text" value="${creds.owner}" class="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-base outline-none focus:border-indigo-500 shadow-inner">
                                </div>
                            </div>
                            <button onclick="window.updatePasswords()" class="w-full py-6 bg-slate-900 text-white rounded-[28px] font-black uppercase text-xs tracking-[0.2em] shadow-xl hover:bg-indigo-600 transition-all active:scale-95 flex items-center justify-center gap-3">
                                <i data-lucide="key" class="w-4 h-4"></i> Synchronize Credentials
                            </button>
                        </div>
                    </div>

                    <!-- Performance Intelligence (Owner Logs) -->
                    <div class="bg-indigo-600 p-10 rounded-[56px] text-white shadow-2xl shadow-indigo-100 relative overflow-hidden">
                        <div class="absolute -right-20 -top-20 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
                        <h3 class="text-xl font-black tracking-tight mb-2">Audit Synchronization</h3>
                        <p class="text-white/60 text-[10px] font-bold uppercase tracking-[0.2em] mb-10">Real-time trace of all terminal operations</p>
                        <button onclick="window.viewStaffLogs()" class="px-10 py-5 bg-white text-indigo-600 rounded-[28px] font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl hover:bg-slate-900 hover:text-white transition-all">Open Activity Logs</button>
                    </div>
                </div>
            </div>`;
        }
    }

    // --- Activity & Logging ---
    window.logActivity = async (staffName, action, details) => {
        try {
            await window.FB.collection('audit_logs').add({
                staffName,
                action,
                details,
                timestamp: Date.now(),
                dateStr: new Date().toLocaleString('en-IN')
            });
        } catch (e) { console.error("Log error:", e); }
    };

    window.viewStaffLogs = async () => {
        const pin = prompt("Owner PIN required to view audit logs:");
        if (pin !== (window.erpState.passwords?.owner || 'Swali4783')) return alert("Access Denied");

        const snap = await window.FB.collection('audit_logs').orderBy('timestamp', 'desc').limit(50).get();
        const logs = snap.docs.map(d => d.data());

        const modal = document.createElement('div');
        modal.className = "fixed inset-0 bg-slate-900/90 backdrop-blur-xl flex items-center justify-center z-[700] p-4";
        modal.innerHTML = `
            <div class="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                <div class="p-8 border-b border-slate-100 flex justify-between items-center">
                    <h3 class="font-black text-xl text-slate-900 uppercase tracking-tighter">System Audit Log</h3>
                    <button onclick="this.closest('.fixed').remove()" class="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-500 transition-all"><i data-lucide="x" class="w-5 h-5"></i></button>
                </div>
                <div class="flex-1 overflow-y-auto p-8 space-y-4 custom-scrollbar bg-slate-50">
                    ${logs.map(l => `
                        <div class="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
                            <div class="flex justify-between items-center mb-2">
                                <span class="text-[10px] font-black text-indigo-600 uppercase tracking-widest">${l.staffName}</span>
                                <span class="text-[9px] font-bold text-slate-400">${l.dateStr}</span>
                            </div>
                            <p class="text-xs font-black text-slate-800 uppercase tracking-tight mb-1">${l.action}</p>
                            <p class="text-[10px] text-slate-500 font-medium">${l.details || ''}</p>
                        </div>
                    `).join('') || '<p class="text-center py-20 text-slate-400 italic font-black uppercase tracking-widest text-xs">No logs found</p>'}
                </div>
            </div>`;
        document.body.appendChild(modal);
        if (window.lucide) lucide.createIcons();
    };

    // --- Settings Logics ---
    window.updatePrinterWidth = async (w) => {
        window.erpState.printerWidth = w;
        window.erpState.printerConfig = window.erpState.printerConfig || {};
        window.erpState.printerConfig.width = w;
        window.renderApp();
        window.saveGeneralSettings();
    };

    window.updatePrinterConfig = async (updates) => {
        const pConf = window.erpState.printerConfig || { width: '58', logo: '', header: 'Lavish Lavender', address: '', footer: 'Visit Again!', showCustomer: true, showTax: true };
        
        if (updates) {
            Object.assign(pConf, updates);
        } else {
            // Read from DOM
            pConf.header = document.getElementById('pc_header').value;
            pConf.address = document.getElementById('pc_address').value;
            pConf.footer = document.getElementById('pc_footer').value;
            pConf.logo = document.getElementById('pc_logo').value;
        }

        window.erpState.printerConfig = pConf;
        window.erpState.printerWidth = pConf.width; // Sync legacy width field
        
        await window.saveGeneralSettings();
        window.renderApp();
        if (!updates) alert("Printer Configuration Synchronized!");
    };

    window.toggleDashWidget = async (widgetId, enabled) => {
        window.erpState.dashboardConfig = window.erpState.dashboardConfig || {};
        window.erpState.dashboardConfig[widgetId] = enabled;
        try {
            await window.FB.collection('settings').doc('general').set({ dashboardConfig: window.erpState.dashboardConfig }, { merge: true });
        } catch (e) { console.error('Dashboard config save error:', e); }
    };

    window.updateGSTIN = async () => {
        const val = document.getElementById('pc_gstin').value.trim();
        window.erpState.gstin = val;
        try {
            await window.FB.collection('settings').doc('general').set({ gstin: val }, { merge: true });
            alert("GSTIN Updated Successfully!");
        } catch (e) {
            console.error(e);
            alert("Error updating GSTIN");
        }
    };

    window.handleLogoUpload = async (input) => {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];
        const btn = input.previousElementSibling;
        const orig = btn.innerText;
        btn.innerText = "Saving..."; btn.disabled = true;

        try {
            const storage = window.FB.storage();
            const ref = storage.ref(`settings/printer_logo_${Date.now()}`);
            const snap = await ref.put(file);
            const url = await snap.ref.getDownloadURL();
            document.getElementById('pc_logo').value = url;
            window.updatePrinterConfig({ logo: url });
        } catch (e) {
            console.error(e);
            alert("Logo upload failed.");
        } finally {
            btn.innerText = orig; btn.disabled = false;
        }
    };

    window.saveTemplates = async () => {
        const temps = {
            booking: document.getElementById('temp_booking').value,
            ready: document.getElementById('temp_ready').value,
            delivered: document.getElementById('temp_delivered').value,
            reminder: document.getElementById('temp_reminder').value
        };
        window.erpState.whatsappTemplates = temps;
        window.renderApp();
        try {
            await window.FB.collection('settings').doc('general').set({ whatsappTemplates: temps }, { merge: true });
            alert("Templates saved successfully!");
        } catch(e) { 
            console.error(e); 
            alert("Error saving templates.");
        }
    };

    // --- POS MODALS & DIALOGS ---

    window.openChargeScreen = () => {
        const subtotal = window.erpState.cart.reduce((a, b) => a + (b.price * b.qty), 0);
        let activeTaxIdx = window.erpState.activeTax || 0;

        const modal = document.createElement('div');
        modal.id = 'charge-modal-overlay';
        modal.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-[500] p-0 sm:p-4";
        modal.innerHTML = `
            <div class="bg-white w-full sm:max-w-[420px] sm:rounded-[40px] rounded-t-[40px] p-5 sm:p-7 shadow-2xl animate-slide-up sm:animate-pop-in border border-slate-100 relative overflow-hidden max-h-[92vh] flex flex-col">
                <div class="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-3 sm:hidden"></div>
                
                <div class="flex items-center justify-between mb-4 pb-3 border-b border-slate-50 shrink-0">
                    <div>
                        <p class="text-[8px] font-black text-violet-600 uppercase tracking-[0.2em] mb-0.5">Billing Terminal</p>
                        <h2 class="text-xl font-black text-slate-800 tracking-tighter uppercase">Checkout</h2>
                    </div>
                    <button onclick="document.getElementById('charge-modal-overlay').remove()" class="w-9 h-9 bg-slate-50 text-slate-400 rounded-xl hover:bg-rose-50 hover:text-rose-500 flex items-center justify-center transition-all">
                         <i data-lucide="x" class="w-4 h-4"></i>
                    </button>
                </div>

                <div class="overflow-y-auto custom-scrollbar flex-1 pr-1 -mr-1">
                    <!-- Cart items summary -->
                    <div class="mb-4 space-y-1 ${window.erpState.cart.length > 3 ? 'max-h-24 overflow-y-auto pr-1 custom-scrollbar' : ''}">
                        ${window.erpState.cart.map(c => `
                            <div class="flex justify-between items-center text-[10px]">
                                <span class="text-slate-500 font-bold truncate flex-1">${c.name} ×${c.qty}</span>
                                <span class="font-black text-slate-700 ml-2">${fmt(c.price * c.qty)}</span>
                            </div>
                        `).join('')}
                    </div>

                    <div id="cm_loyalty_preview" class="hidden mb-4 p-4 bg-slate-900 border border-slate-800 rounded-[28px] animate-pop-in shrink-0">
                        <!-- Injected by lookup -->
                    </div>

                    <div class="space-y-4 mb-6">
                        <div class="grid grid-cols-2 gap-3">
                            <input id="cm_client_phone" oninput="window.lookupClient(this.value)" type="tel" placeholder="Phone Number" class="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl font-bold text-xs outline-none focus:ring-4 focus:ring-violet-500/10 shadow-inner">
                            <input id="cm_client_name" type="text" placeholder="Customer Name" class="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl font-bold text-xs outline-none focus:ring-4 focus:ring-violet-500/10 shadow-inner">
                        </div>

                        <div class="bg-slate-50 p-4 rounded-[28px] border border-slate-100 space-y-4">
                            <div class="flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-slate-400">
                                <span>Subtotal</span>
                                <span class="text-slate-600">${fmt(subtotal)}</span>
                            </div>

                            <div class="grid grid-cols-2 gap-3">
                                <div>
                                    <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Discount</label>
                                    <div class="space-y-2">
                                        <select id="cm_discount_select" onchange="window.handleDiscountChange(this.value, ${subtotal})" class="w-full px-3 py-2 bg-white border border-slate-100 rounded-lg font-bold text-[10px] outline-none focus:ring-2 focus:ring-violet-500/20">
                                            <option value="">No Discount</option>
                                            ${window.erpState.discounts.map(d => `<option value="${d.label}" ${window.erpState.activeDiscountLabel === d.label ? 'selected' : ''}>${d.label} (${d.type === 'pct' ? d.val + '%' : '₹' + d.val})</option>`).join('')}
                                        </select>
                                        <input id="cm_discount_manual" type="number" oninput="window.erpState.activeDiscountAmt = parseFloat(this.value)||0; window.updateCMFinal(${subtotal})" placeholder="Enter ₹" class="hidden w-full px-3 py-2 bg-white border border-violet-100 rounded-lg font-black text-rose-500 text-[10px] outline-none focus:ring-2 focus:ring-rose-500/20 animate-pop-in">
                                    </div>
                                </div>
                                <div>
                                    <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Taxation</label>
                                    <select id="cm_tax_select" onchange="window.erpState.activeTax=parseInt(this.value); window.updateCMFinal(${subtotal})" class="w-full px-3 py-2 bg-white border border-slate-100 rounded-lg font-bold text-[10px] outline-none focus:ring-2 focus:ring-violet-500/20">
                                        ${window.erpState.taxes.map((t, i) => `<option value="${i}" ${activeTaxIdx == i ? 'selected' : ''}>${t.label} (${t.val}%)</option>`).join('')}
                                    </select>
                                </div>
                            </div>

                            <div class="grid grid-cols-2 gap-3">
                                <div>
                                    <div class="flex items-center justify-between mb-1.5 px-1">
                                        <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest">Amount Paid</label>
                                        <label class="flex items-center gap-1 cursor-pointer">
                                            <input type="checkbox" id="cm_is_advance" onchange="window.toggleAdvanceMode(${subtotal})" class="w-2.5 h-2.5 rounded border-slate-300">
                                            <span class="text-[8px] font-black text-violet-500 uppercase tracking-tighter">Advance?</span>
                                        </label>
                                    </div>
                                    <input id="cm_advance" type="number" oninput="window.updateCMFinal(${subtotal})" placeholder="0" class="w-full px-3 py-2.5 bg-white border border-slate-100 rounded-xl font-black text-emerald-600 text-base outline-none focus:ring-2 focus:ring-emerald-500/20">
                                </div>
                                <div>
                                    <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block ml-1">Method</label>
                                    <select id="cm_payment_method" onchange="window.handlePaymentMethodChange(this.value, ${subtotal})" class="w-full px-3 py-2 bg-white border border-slate-100 rounded-lg font-bold text-[10px] outline-none">
                                        <option value="Cash">Cash</option>
                                        <option value="UPI">UPI / GPay</option>
                                        <option value="Mixed">Mixed (Split)</option>
                                    </select>
                                </div>
                            </div>

                            <div id="cm_mixed_inputs" class="hidden grid grid-cols-2 gap-3 bg-slate-900/5 p-3 rounded-2xl border border-slate-900/10">
                                <div>
                                     <label class="text-[7px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1 block pl-2">Cash Split</label>
                                     <input id="cm_mixed_cash" type="number" oninput="window.autoCalcMixed('cash', ${subtotal})" placeholder="0" class="w-full px-3 py-2 bg-white border-none rounded-lg font-bold text-[10px] outline-none shadow-sm">
                                </div>
                                <div>
                                     <label class="text-[7px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1 block pl-2">UPI Split</label>
                                     <input id="cm_mixed_upi" type="number" oninput="window.autoCalcMixed('upi', ${subtotal})" placeholder="0" class="w-full px-3 py-2 bg-white border-none rounded-lg font-bold text-[10px] outline-none shadow-sm">
                                </div>
                            </div>
                        </div>

                        <div class="bg-slate-900 p-5 rounded-[28px] shadow-xl relative overflow-hidden">
                            <div class="absolute -right-4 -top-4 w-16 h-16 bg-white/5 rounded-full blur-xl"></div>
                            <div class="flex justify-between items-center mb-1">
                                <span class="text-[8px] font-black text-slate-500 uppercase tracking-widest">Bill Total</span>
                                <span id="cm_bill_total" class="text-sm font-black text-slate-300">--</span>
                            </div>
                            <div class="flex justify-between items-center relative z-10">
                                <span id="cm_final_label" class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Remaining Balance</span>
                                <span id="cm_final" class="text-2xl font-black text-white">--</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="pt-3 shrink-0">
                    <button onclick="window._completeCheckout()" class="w-full py-4 bg-violet-600 text-white rounded-[24px] font-black uppercase tracking-[0.2em] text-[10px] shadow-2xl shadow-violet-200 hover:bg-slate-900 transition-all active:scale-95 flex items-center justify-center gap-3">
                        <i data-lucide="shield-check" class="w-4 h-4"></i> Confirm Transaction
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        if (window.lucide) lucide.createIcons();
        document.getElementById('cm_client_phone').focus();

        // Helpers specifically for this screen
        window.toggleAdvanceMode = (sub) => {
            const isAdv = document.getElementById('cm_is_advance').checked;
            const advInput = document.getElementById('cm_advance');
            if (!isAdv) {
                advInput.readOnly = true;
                advInput.classList.add('bg-slate-50', 'text-slate-400');
                advInput.classList.remove('bg-white', 'text-emerald-600');
            } else {
                advInput.readOnly = false;
                advInput.classList.remove('bg-slate-50', 'text-slate-400');
                advInput.classList.add('bg-white', 'text-emerald-600');
                advInput.focus();
            }
            window.updateCMFinal(sub);
        };

        window.handlePaymentMethodChange = (val, sub) => {
            document.getElementById('cm_mixed_inputs').classList.toggle('hidden', val !== 'Mixed');
            window.updateCMFinal(sub);
        };

        window.handleDiscountChange = (label, sub) => {
            const d = window.erpState.discounts.find(x => x.label === label);
            const manualInput = document.getElementById('cm_discount_manual');
            
            if (!d) {
                window.erpState.activeDiscountAmt = 0;
                window.erpState.activeDiscountLabel = "";
                manualInput.classList.add('hidden');
            } else {
                window.erpState.activeDiscountLabel = label;
                if (d.type === 'cash' && d.val === 0) {
                    manualInput.classList.remove('hidden');
                    manualInput.value = window.erpState.activeDiscountAmt || "";
                    manualInput.focus();
                } else {
                    manualInput.classList.add('hidden');
                    window.erpState.activeDiscountAmt = d.type === 'pct' ? (sub * d.val / 100) : d.val;
                }
            }
            window.updateCMFinal(sub);
        };

        window.autoCalcMixed = (source, sub) => {
            const advVal = parseFloat(document.getElementById('cm_advance').value || 0);
            const subtotal = sub;
            const disc = window.erpState.activeDiscountAmt || 0;
            const redeem = parseFloat(document.getElementById('cm_redeem_amt')?.value || 0);
            const taxIdx = window.erpState.activeTax || 0;
            const taxVal = (window.erpState.taxes[taxIdx] || {val:0}).val;
            
            const billTotal = (subtotal - disc - redeem) * (1 + taxVal / 100);
            const isAdv = document.getElementById('cm_is_advance').checked;
            const targetToPay = isAdv ? advVal : billTotal;

            const cashEl = document.getElementById('cm_mixed_cash');
            const upiEl = document.getElementById('cm_mixed_upi');

            if (source === 'cash') {
                const val = parseFloat(cashEl.value || 0);
                upiEl.value = Math.max(0, targetToPay - val).toFixed(2);
            } else {
                const val = parseFloat(upiEl.value || 0);
                cashEl.value = Math.max(0, targetToPay - val).toFixed(2);
            }
        };

        window.updateCMFinal = (sub) => {
            const disc = window.erpState.activeDiscountAmt || 0;
            const redeem = parseFloat(document.getElementById('cm_redeem_amt')?.value || 0);
            const taxIdx = window.erpState.activeTax || 0;
            const taxVal = (window.erpState.taxes[taxIdx] || {val:0}).val;
            
            const billTotal = (sub - disc - redeem) * (1 + taxVal / 100);
            document.getElementById('cm_bill_total').innerText = fmt(billTotal);

            const isAdv = document.getElementById('cm_is_advance').checked;
            const advInput = document.getElementById('cm_advance');
            
            if (!isAdv) {
                advInput.value = Math.round(billTotal);
                document.getElementById('cm_final').innerText = fmt(billTotal);
                document.getElementById('cm_final_label').innerText = "Collected Total";
            } else {
                const paid = parseFloat(advInput.value || 0);
                const balance = Math.max(0, billTotal - paid);
                document.getElementById('cm_final').innerText = fmt(balance);
                document.getElementById('cm_final_label').innerText = balance > 0 ? "Remaining Balance" : "Fully Settled (Advance)";
            }

            // Sync mixed inputs if visible
            if (document.getElementById('cm_payment_method').value === 'Mixed') {
                window.autoCalcMixed('cash', sub);
            }

            // Update points preview
            if (!document.getElementById('cm_loyalty_preview').classList.contains('hidden')) {
                const phone = document.getElementById('cm_client_phone').value;
                const c = window.erpState.clients.find(x => x.phone === phone);
                if (c) {
                    const tier = window.getLoyaltyTier(c.totalSpent || 0);
                    const earned = window.calcPoints(billTotal, tier);
                    const earnedEl = document.getElementById('cm_earned_pts');
                    if (earnedEl) earnedEl.innerText = '+' + earned;
                }
            }
        };

        // Initialize state
        window.toggleAdvanceMode(subtotal);
    };

    window._completeCheckout = async () => {
        const phone = document.getElementById('cm_client_phone').value.trim();
        const name = document.getElementById('cm_client_name').value.trim();
        const advance = parseFloat(document.getElementById('cm_advance').value || 0);
        const method = document.getElementById('cm_payment_method') ? document.getElementById('cm_payment_method').value : document.getElementById('cm_method').value;
        const discountAmt = window.erpState.activeDiscountAmt || 0;
        const redeemAmt = parseFloat(document.getElementById('cm_redeem_amt')?.value || 0);

        if(!phone || phone.length < 10) return alert("Valid phone number required");
        if(!name) return alert("Customer name required");

        const staffCode = prompt("Enter Staff PIN to authorize checkout:");
        if (!staffCode) return;
        
        const staff = (window.erpState.staff || []).find(s => s.code === staffCode);
        const isOwner = staffCode === (window.erpState.passwords?.owner || 'Swali4783');
        if (!staff && !isOwner) return alert("Invalid Authorization Code");

        const recordedBy = isOwner ? 'Owner' : staff.name;

        const btn = document.querySelector("#charge-modal-overlay button.bg-violet-600") || document.querySelector("button[onclick='window._completeCheckout()']");
        const origText = btn.innerHTML;
        btn.innerHTML = `<i class="w-5 h-5 animate-spin border-2 border-white/20 border-t-white rounded-full"></i> AUTHORIZING...`;
        btn.disabled = true;

        try {
            const subtotal = window.erpState.cart.reduce((a, b) => a + (b.price * b.qty), 0);
            
            const taxIdx = window.erpState.activeTax || 0;
            const taxVal = (window.erpState.taxes[taxIdx] || {val:0}).val;
            const total = Math.max(0, (subtotal - discountAmt - redeemAmt) * (1 + taxVal / 100));

            const counter = (window.erpState.counter || 2499) + 1;
            const billNo = "4-" + counter;

            const isAdvance = document.getElementById('cm_is_advance')?.checked || false;
            const amtEntered = advance;
            
            // Core Logic: If 'isAdvance' is checked, it's a partial payment. Otherwise it's full.
            let finalPaid = isAdvance ? amtEntered : total;

            let cash = 0, upi = 0;
            if (method === 'Mixed') {
                cash = parseFloat(document.getElementById('cm_mixed_cash').value) || 0;
                upi = parseFloat(document.getElementById('cm_mixed_upi').value) || 0;
                // Ensure finalPaid reflects exactly what was distributed in mixed breakdown
                finalPaid = cash + upi;
            } else if (method === 'Cash') {
                cash = finalPaid;
            } else if (method === 'UPI') {
                upi = finalPaid;
            }

            const balanceDue = Math.max(0, total - finalPaid);

            const client = window.erpState.clients.find(c => c.phone === phone);
            const oldSpent = client ? (client.totalSpent || 0) : 0;
            const oldTier = window.getLoyaltyTier(oldSpent);
            const pointsEarned = window.calcPoints(total, oldTier);
            
            const saleData = {
                billNo,
                customerName: name,
                customerPhone: phone,
                date: Date.now(),
                timestamp: Date.now(),
                items: JSON.parse(JSON.stringify(window.erpState.cart)),
                subtotal, 
                discount: discountAmt,
                taxIdx,
                taxValue: taxVal,
                redeemedPoints: redeemAmt,
                total, 
                advancePaid: finalPaid,
                balanceDue: balanceDue,
                isPartial: isAdvance,
                paymentMode: method,
                paymentBreakdown: { cash, upi },
                counter: counter,
                recordedBy: recordedBy,
                loyaltySnapshot: {
                    earned: pointsEarned,
                    total: (client ? (client.loyaltyPoints || 0) : 0) - redeemAmt + pointsEarned,
                    tier: window.getLoyaltyTier(oldSpent + total)
                }
            };

            await DATA_PATH('sales').add(saleData);
            window.logActivity(recordedBy, "Completed Sale", `Bill ${billNo} for ${name} - ${fmt(total)}`);

            // Update linked orders with customer info
            for (const item of window.erpState.cart) {
                if (item.tailoringRef) {
                    try {
                        const orderSnap = await window.FB.root('orders').where('billNo', '==', item.tailoringRef).get();
                        if (!orderSnap.empty) {
                            const orderDoc = orderSnap.docs[0];
                            const orderData = orderDoc.data();
                            // Only update if it's currently marked as 'POS Pending'
                            if (orderData.customerName === "POS Pending") {
                                await window.FB.root('orders').doc(orderDoc.id).update({
                                    customerName: name,
                                    phone: phone,
                                    recordedBy: recordedBy,
                                    staff: recordedBy,
                                    notesLog: (orderData.notesLog || []).concat([{ 
                                        text: `Customer linked & recorded by ${recordedBy} via POS Checkout`, 
                                        timestamp: new Date().toLocaleString() 
                                    }])
                                });
                            }
                        }
                    } catch (err) {
                        console.error("Failed to update linked order:", err);
                    }
                }
            }
            
            if(!client){
                const newSpent = total;
                const newTier = window.getLoyaltyTier(newSpent);
                await window.FB.root('clients').add({ 
                    name, phone, 
                    createdAt: Date.now(), 
                    loyaltyPoints: pointsEarned, 
                    totalSpent: newSpent,
                    tier: newTier
                });
            } else {
                const newSpent = (client.totalSpent || 0) + total;
                const newPoints = (client.loyaltyPoints || 0) - redeemAmt + pointsEarned;
                const newTier = window.getLoyaltyTier(newSpent);
                
                await window.FB.root('clients').doc(client.id).update({
                    loyaltyPoints: newPoints,
                    totalSpent: newSpent,
                    tier: newTier,
                    lastVisit: Date.now()
                });

                if (newTier !== oldTier) {
                    setTimeout(() => alert(`Congratulations! ${name} upgraded to ${newTier.toUpperCase()} tier! 🎉`), 500);
                }
            }

            if (pointsEarned > 0) {
                setTimeout(() => alert(`Success! You earned ${pointsEarned} points 🎉`), 200);
            }

            document.getElementById('charge-modal-overlay').remove();
            window.erpState.cart = [];
            window.erpState.counter = counter;
            window.erpState.activeDiscountAmt = 0;
            window.erpState.activeDiscountLabel = "";
            
            window.showSuccessScreen(billNo, total, name, phone);
            window.scheduleRender();
        } catch (e) {
            console.error(e);
            alert("Database write failed.");
            btn.innerHTML = origText;
            btn.disabled = false;
        }
    };

    window.showSuccessScreen = (billNo, total, name, phone) => {
        const modal = document.createElement('div');
        modal.className = "fixed inset-0 bg-slate-900/90 backdrop-blur-3xl flex items-center justify-center z-[600] p-4";
        modal.innerHTML = `
            <div class="bg-white w-full max-w-sm rounded-[40px] p-10 text-center animate-pop-in shadow-2xl relative overflow-hidden">
                <div class="absolute -right-6 -top-6 w-32 h-32 bg-emerald-50 rounded-full blur-3xl"></div>
                
                <div class="w-24 h-24 bg-emerald-500 text-white rounded-[32px] flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-emerald-200 rotate-6 translate-y-2">
                    <i data-lucide="check" class="w-12 h-12 stroke-[4]"></i>
                </div>
                
                <h2 class="text-3xl font-black text-slate-900 tracking-tighter mb-2">Sale Recorded!</h2>
                <p class="text-slate-400 font-bold text-sm mb-10">Invoice ${billNo} • ${fmt(total)}</p>

                <div class="space-y-3">
                    <button onclick="window.shareWhatsApp('${billNo}', '${name}', '${phone}', ${total})" class="w-full py-4 bg-[#25D366] text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-lg flex items-center justify-center gap-3">
                        <i data-lucide="message-circle" class="w-5 h-5"></i> WhatsApp Bill
                    </button>
                    <button onclick="window.printThermal('${billNo}')" class="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-lg flex items-center justify-center gap-3">
                        <i data-lucide="printer" class="w-5 h-5"></i> Thermal Print
                    </button>
                    <a href="https://www.lavishlavender.in/receipt/?bill=${billNo}" target="_blank" class="w-full py-4 bg-white border border-slate-200 text-slate-800 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] flex items-center justify-center gap-3">
                        <i data-lucide="file-text" class="w-5 h-5"></i> View PDF Receipt
                    </a>
                </div>

                <button onclick="this.closest('.fixed').remove()" class="mt-8 text-[10px] font-black uppercase tracking-[0.3em] text-slate-300 hover:text-slate-500 transition-all">Close & Return</button>
            </div>
        `;
        document.body.appendChild(modal);
        lucide.createIcons();
    };

    // --- RECENT APP Logic (Tickets, Dues helpers) ---

    window.saveTicket = async () => {
        if(window.erpState.cart.length === 0) return;
        const name = prompt("Enter Table # or Guest Name:", "Guest");
        if(!name) return;
        
        const ticket = {
            customer: name,
            items: [...window.erpState.cart],
            total: window.erpState.cart.reduce((a,b) => a + (b.price * b.qty), 0),
            time: new Date().toLocaleTimeString(),
            createdAt: Date.now()
        };
        
        await DATA_PATH('tickets').add(ticket);
        window.erpState.cart = [];
        window.renderApp();
    };

    window.loadTicket = (idx) => {
        const t = window.erpState.tickets[idx];
        window.erpState.cart = [...t.items];
        if(t.id) DATA_PATH('tickets').doc(t.id).delete();
        window.erpState.tab = 'pos';
        window.renderApp();
    };

    window.deleteTicket = async (idx) => {
        if(!confirm("Discard this saved ticket?")) return;
        const t = window.erpState.tickets[idx];
        if(t.id) await DATA_PATH('tickets').doc(t.id).delete();
        window.renderApp();
    };

    window.collectDue = async (id) => {
        const s = window.erpState.sales.find(x => x.id === id);
        if(!s) return;
        
        const amt = parseFloat(prompt(`Collecting payment for ${s.billNo}. Remaining: ${fmt(s.balanceDue)}\nEnter amount:`, s.balanceDue));
        if(isNaN(amt) || amt <= 0) return;
        
        const method = prompt("Payment Method (Cash/UPI/Card):", "Cash");
        
        try {
            const newPaid = (s.advancePaid || 0) + amt;
            const newBal = Math.max(0, s.total - newPaid);
            
            await DATA_PATH('sales').doc(id).update({
                advancePaid: newPaid,
                balanceDue: newBal,
                paymentLog: (s.paymentLog || []).concat([{ date: Date.now(), amount: amt, method, note: "Due Collection" }])
            });
            alert("Payment recorded!");
            window.renderApp();
        } catch (e) { alert("Sync Error"); }
    };

    window.openReceipt = (id) => {
        let sale = window.erpState.sales.find(s => s.id === id);
        if (!sale) {
            sale = window.erpState.orders.find(o => o.id === id);
        }
        if (!sale) return;

        // Unified Mapping with 0-safe checks
        const subtotal = sale.subtotal || sale.totalCost || 0;
        const discount = sale.discount || sale.deliveryDiscount || 0;
        const total = sale.total || sale.totalCost || (subtotal - discount);
        const balance = sale.balanceDue !== undefined ? sale.balanceDue : Math.max(0, (sale.totalCost || 0) - (sale.advancePaid || 0) - (sale.deliveryDiscount || 0));

        const tailoringRefs = [...new Set((sale.items || []).map(i => i.tailoringRef || i.tailoringBillNo).filter(Boolean))];
        const tailoringHtml = tailoringRefs.length > 0 ? `
            <div class="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl mb-4">
                <p class="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1">Tailoring Reference</p>
                <p class="font-black text-indigo-600">${tailoringRefs.join(', ')}</p>
            </div>
        ` : '';

        const modal = document.createElement("div");
        modal.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-[500] p-0 sm:p-4";
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

        modal.innerHTML = `
            <div class="bg-white w-full sm:max-w-sm sm:rounded-[40px] rounded-t-[40px] shadow-2xl animate-slide-up sm:animate-pop-in border border-slate-100 overflow-hidden my-auto relative max-h-[90vh] overflow-y-auto custom-scrollbar">
                <div class="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mt-4 mb-2 sm:hidden"></div>
                <button onclick="this.closest('.fixed').remove()" class="absolute top-8 right-8 w-10 h-10 bg-white/80 backdrop-blur-md border border-slate-200 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-500 transition-all shadow-sm z-10">
                    <i data-lucide="x" class="w-4 h-4"></i>
                </button>
                
                <div class="bg-slate-50 border-b border-slate-100 p-8 flex items-center justify-between text-slate-800">
                    <div>
                        <h3 class="font-black text-xl leading-none">${sale.billNo}</h3>
                        <p class="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1.5">${new Date(sale.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                    </div>
                </div>

                <div class="p-8">
                    <div class="mb-6">
                        <h4 class="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Customer Details</h4>
                        <p class="font-black text-slate-900 text-lg leading-tight">${sale.customerName || 'Walk-in'}</p>
                        <p class="text-slate-400 font-bold text-sm mt-0.5">${sale.customerPhone || 'N/A'}</p>
                    </div>
                    
                    ${tailoringHtml}

                    <div class="mb-8">
                        <h4 class="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Summary</h4>
                        <div class="space-y-2.5 max-h-40 overflow-y-auto custom-scrollbar pr-2">
                            ${(sale.items || []).map(i => `
                                <div class="flex justify-between items-center text-sm font-bold">
                                    <span class="text-slate-500">${i.name} <span class="text-[10px] text-slate-300 ml-1">x${i.qty}</span></span>
                                    <span class="text-slate-900">${fmt(i.price * i.qty)}</span>
                                </div>
                            `).join('')}
                            ${(sale.refundLog || []).map(r => `
                                <div class="flex justify-between items-center text-sm font-bold text-rose-400" style="opacity:0.8">
                                    <span>${r.item} (Returned)</span>
                                    <span>-${fmt(r.amount)}</span>
                                </div>
                            `).join('')}
                        </div>
                        <div class="mt-4 pt-4 border-t border-dashed border-slate-100 flex justify-between items-center">
                            <span class="text-[10px] font-black text-slate-400 uppercase">Final Total</span>
                            <span class="text-xl font-black text-violet-600">${fmt(sale.total)}</span>
                        </div>
                        ${balance > 0 ? `
                            <div class="flex justify-between items-center bg-rose-50 px-3 py-2 rounded-lg mt-2">
                                <span class="text-[10px] font-black text-rose-400 uppercase">Balance Due</span>
                                <span class="text-sm font-black text-rose-600">${fmt(balance)}</span>
                            </div>
                        ` : ''}
                    </div>

                    <div class="grid grid-cols-2 gap-3">
                        <button onclick="window.printThermal('${sale.billNo}')" class="flex items-center justify-center gap-2 py-4 bg-slate-100 text-slate-800 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all">
                            <i data-lucide="printer" class="w-3.5 h-3.5"></i> Thermal
                        </button>
                        <a href="https://www.lavishlavender.in/receipt/?bill=${sale.billNo}" target="_blank" class="flex items-center justify-center gap-2 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-black transition-all">
                            <i data-lucide="file-text" class="w-3.5 h-3.5"></i> PDF Receipt
                        </a>
                    </div>
                    
                    <button onclick="window.shareWhatsApp('${sale.billNo}','${sale.customerName}','${sale.customerPhone}',${sale.total},${balance})" class="w-full flex items-center justify-center gap-2 py-4 bg-emerald-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg hover:bg-emerald-600 transition-all mt-3">
                        <i data-lucide="message-circle" class="w-4 h-4"></i> WhatsApp Receipt
                    </button>

                    <div class="mt-6 pt-6 border-t border-slate-50 flex items-center justify-between">
                        <button onclick="window.refundItem('${sale.id}')" class="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-amber-500 flex items-center gap-1.5 transition-colors">
                            <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i> Refund Item
                        </button>
                        <button onclick="window.voidBill('${sale.id}')" class="text-[10px] font-black text-rose-300 uppercase tracking-widest hover:text-rose-600 flex items-center gap-1.5 transition-colors">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Void Bill
                        </button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modal);
        lucide.createIcons();
    };

    window.refundItem = async (id) => {
        const sale = window.erpState.sales.find(s => s.id === id);
        if (!sale) return;

        const modal = document.createElement("div");
        modal.className = "fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-[600] p-4";
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
        modal.innerHTML = `
            <div class="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl animate-pop-in border border-slate-100 relative">
                <button onclick="this.closest('.fixed').remove()" class="absolute top-6 right-6 w-8 h-8 flex items-center justify-center bg-slate-50 text-slate-400 rounded-xl hover:bg-slate-100 transition-colors">
                    <i data-lucide="x" class="w-4 h-4"></i>
                </button>
                <div class="text-center mb-6">
                    <h3 class="text-xl font-black text-slate-800">Process Refund</h3>
                    <p class="text-slate-400 text-sm font-bold">Select item to return from ${sale.billNo}</p>
                </div>
                
                <div class="space-y-2 mb-6 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                    ${(sale.items || []).map((item, idx) => `
                        <button onclick="window._confirmRefund('${id}', ${idx})" class="w-full flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl hover:border-amber-400 hover:bg-amber-50 group transition-all text-left">
                            <div>
                                <p class="font-black text-slate-800 group-hover:text-amber-700">${item.name}</p>
                                <p class="text-[10px] font-bold text-slate-400">Qty: ${item.qty} | Price: ${fmt(item.price)}</p>
                            </div>
                            <i data-lucide="rotate-ccw" class="w-4 h-4 text-slate-300 group-hover:text-amber-500"></i>
                        </button>
                    `).join('')}
                </div>
                
                <button onclick="this.closest('.fixed').remove()" class="w-full py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold text-sm uppercase tracking-widest">Cancel</button>
            </div>`;
        document.body.appendChild(modal);
        lucide.createIcons();
    };

    window._confirmRefund = async (saleId, itemIdx) => {
        const sale = window.erpState.sales.find(s => s.id === saleId);
        const item = sale.items[itemIdx];

        let qtyToRefund = item.qty;
        if (item.qty > 1) {
            const ans = prompt(`How many ${item.name} to refund? (Max ${item.qty})`, item.qty);
            if (ans === null) return;
            qtyToRefund = parseFloat(ans);
            if (isNaN(qtyToRefund) || qtyToRefund <= 0 || qtyToRefund > item.qty) {
                alert("Invalid quantity");
                return;
            }
        }

        if (!confirm(`Confirm refund for ${qtyToRefund}x ${item.name}? This will restock the item and deduct ${fmt(item.price * qtyToRefund)} from the bill total.`)) return;

        try {
            // 1. Update stock (local state + firebase)
            const originalItem = window.erpState.items.find(x => x.id === item.id || x.sku === item.sku);
            if (originalItem) {
                await DATA_PATH('items').doc(originalItem.id).update({
                    stock: Number(originalItem.stock || 0) + qtyToRefund
                });
            }

            // 2. Update sale record
            const refundValue = item.price * qtyToRefund;
            const newSubtotal = Math.max(0, (sale.subtotal || 0) - refundValue);
            const newTotal = Math.max(0, (sale.total || 0) - refundValue);
            const newBalanceDue = Math.max(0, (sale.balanceDue || 0) - refundValue);

            const newItems = JSON.parse(JSON.stringify(sale.items));
            if (qtyToRefund === item.qty) {
                newItems.splice(itemIdx, 1);
            } else {
                newItems[itemIdx].qty -= qtyToRefund;
            }

            await DATA_PATH('sales').doc(saleId).update({
                items: newItems,
                subtotal: newSubtotal,
                total: newTotal,
                balanceDue: newBalanceDue,
                refundLog: [...(sale.refundLog || []), { item: item.name, amount: refundValue, date: Date.now() }]
            });

            alert("Refund processed successfully.");
            document.querySelectorAll(".fixed .animate-pop-in").forEach(x => x.closest('.fixed').remove());
            window.renderApp();
        } catch (e) {
            alert("Error processing refund. Check connection.");
            console.error(e);
        }
    };

    window.voidBill = async (id) => {
        const pin = prompt("Admin Access PIN required to void bill:");
        if (pin === '1234') {
            if (confirm("Permanently delete this bill? This cannot be undone.")) {
                try {
                    await DATA_PATH('sales').doc(id).delete();
                    alert("Bill voided and removed.");
                    document.querySelectorAll(".fixed .animate-pop-in").forEach(x => x.closest('.fixed').remove());
                    window.renderApp();
                } catch (e) { alert("Delete failed"); }
            }
        } else if (pin !== null) {
            alert("Incorrect PIN.");
        }
    };

    window.printThermal = (billNo) => {
        const sale = window.erpState.sales.find(s => s.billNo === billNo);
        if (!sale) return;
        const items = sale.items || [];
        const pConf = window.erpState.printerConfig || { width: '58', logo: '', header: 'Lavish Lavender', footer: 'Visit Again!', showCustomer: true, showTax: true };
        const width = pConf.width || '58';
        const widthPx = width === '80' ? '80mm' : '58mm';

        const dateObj = new Date(sale.date);
        const dateStr = dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        const timeStr = dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

        const w = window.open('', '_blank', `width=${width === '80' ? 450 : 350},height=600`);
        
        let html = `<html><body style='font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;width:${widthPx};font-size:12px;margin:0 auto;padding:10px 5px;line-height:1.4;color:#111;text-align:center;'>`;

        if (pConf.logo) {
            html += `<div style='margin-bottom:10px;'><img src='${pConf.logo}' style='max-width:140px;max-height:80px;'></div>`;
        }
        html += `<div style='font-weight:bold;font-size:15px;margin-bottom:4px;'>${pConf.header || 'Lavish lavender'}</div>`;
        if (pConf.address) {
            const lines = pConf.address.split('\n');
            lines.forEach(line => {
                html += `<div style='font-size:12px;color:#444;'>${line.trim()}</div>`;
            });
        }
        
        html += `<hr style='border:none;border-top:1px dashed #ccc;margin:16px 0;'>`;

        // Big Total
        html += `<div style='font-size:28px;font-weight:500;margin-bottom:4px;letter-spacing:-0.5px;'>₹${sale.total || 0}</div>`;
        html += `<div style='font-size:12px;color:#666;'>Total</div>`;

        html += `<hr style='border:none;border-top:1px dashed #ccc;margin:16px 0;'>`;

        // Employee & POS
        const employeeName = sale.recordedBy || window.erpState.role || 'Owner';
        html += `<div style='text-align:left;font-size:12px;margin-bottom:4px;'>Employee: ${employeeName}</div>`;
        html += `<div style='text-align:left;font-size:12px;'>POS: Tab 2</div>`;

        html += `<hr style='border:none;border-top:1px dashed #ccc;margin:16px 0;'>`;

        // Items list formatted to match Loyverse
        html += `<div style='text-align:left;'>`;
        items.forEach(i => {
            html += `<div style='display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;'>`;
            html += `  <div style='flex:1;padding-right:10px;'>`;
            html += `    <div style='font-size:12px;color:#111;'>${i.name}</div>`;
            html += `    <div style='font-size:11px;color:#666;margin-top:2px;'>${i.qty} &times; ₹${i.price}</div>`;
            html += `  </div>`;
            html += `  <div style='font-size:12px;color:#111;'>₹${i.price * i.qty}</div>`;
            html += `</div>`;
        });

        // Summary lines
        html += `<div style='display:flex;justify-content:space-between;font-weight:bold;font-size:12px;margin-top:20px;margin-bottom:10px;'>`;
        html += `  <span>Total</span>`;
        html += `  <span>₹${sale.total || 0}</span>`;
        html += `</div>`;

        // Advance paid / Cash
        const paid = sale.advancePaid || (sale.total || 0);
        html += `<div style='display:flex;justify-content:space-between;font-size:12px;margin-bottom:10px;'>`;
        html += `  <span>Cash</span>`;
        html += `  <span>₹${paid}</span>`; 
        html += `</div>`;

        // Balance Due
        const balance = sale.balanceDue || 0;
        if (balance > 0) {
            html += `<div style='display:flex;justify-content:space-between;font-size:12px;margin-bottom:10px;'>`;
            html += `  <span>Balance</span>`;
            html += `  <span style="color:#d97706;font-weight:bold;">₹${balance}</span>`; 
            html += `</div>`;
        }
        
        // Tax explicit breakdown (if applicable/enabled)
        if (pConf.showTax && sale.taxValue > 0) {
            const subtotal = sale.subtotal || 0;
            const discount = sale.discount || 0;
            const total = sale.total || 0;
            html += `<div style='display:flex;justify-content:space-between;font-size:12px;color:#666;margin-top:10px;'>`;
            html += `  <span>Tax (${sale.taxValue}%)</span>`;
            html += `  <span>₹${total - (subtotal - discount)}</span>`;
            html += `</div>`;
        }

        html += `</div>`; // Close text-align:left
        html += `<hr style='border:none;border-top:1px dashed #ccc;margin:16px 0;'>`;

        // Footer Care Notes (exactly as requested)
        html += `<div style='text-align:center;font-size:11px;color:#555;line-height:1.5;margin-bottom:16px;'>`;
        html += `Dry Wash Only, No Exchange, No Refund<br>`;
        html += `Thank your for purchase,<br>`;
        html += `Please come back again.`;
        html += `</div>`;

        // Date and Receipt Number
        html += `<div style='display:flex;justify-content:space-between;font-size:11px;color:#555;'>`;
        html += `  <span>${dateStr} ${timeStr}</span>`;
        html += `  <span>№ ${billNo}</span>`;
        html += `</div>`;
        
        if (window.erpState.gstin) {
            html += `<div style='text-align:center;font-size:10px;color:#555;margin-top:16px;'>GSTIN: ${window.erpState.gstin}</div>`;
        }

        // Loyalty Info optionally at the bottom
        if (sale.loyaltySnapshot) {
            const ls = sale.loyaltySnapshot;
            html += `<div style='text-align:center;font-size:10px;color:#111;background:#f8fafc;padding:8px;border-radius:8px;margin-top:16px;'>`;
            html += `<div style='margin-bottom:4px;'><strong style='color:#d97706'>${(ls.tier || 'Basic').toUpperCase()} TIER</strong></div>`;
            html += `Earned: ${ls.earned} pts | Total: ${ls.total} pts`;
            html += `</div>`;
        }

        html += `<div style='text-align:center;font-size:10px;color:#999;margin-top:30px;'>`;
        html += `&copy; 2026 Loyverse. All rights reserved.`;
        html += `</div>`;

        html += "</body></html>";

        const style = `<style>@media print { @page { margin: 0; size: ${widthPx} auto; } body { margin: 0; padding: 0; width: ${widthPx}; overflow: hidden; } html, body { height: auto !important; margin: 0 !important; padding: 0 !important; } } body { width: ${widthPx}; padding: 0; margin: 0; }</style>`;

        w.document.write(style + html);
        w.document.close();
        w.focus();
        setTimeout(() => {
            w.print();
            setTimeout(() => { w.close(); }, 500);
        }, 500);
    };

    window.printReceipt = (billNo) => window.printThermal(billNo);

    // --- MISC UTILS ---
    // Helper for WhatsApp placeholders
    function fillTemplate(tpl, data) {
        return tpl.replace(/{(\w+)}/g, (match, key) => {
            return data[key] !== undefined ? data[key] : match;
        });
    }

    window.lookupClient = (p) => {
        if(p.length < 5) return;
        const c = window.erpState.clients.find(x => x.phone.includes(p));
        if(c) {
            const nameEl = document.getElementById('cm_client_name');
            if (nameEl) {
                nameEl.value = c.name;
                nameEl.classList.add('text-violet-600');
            }

            const loyPreview = document.getElementById('cm_loyalty_preview');
            if (loyPreview) {
                const tierKey = window.getLoyaltyTier(c.totalSpent || 0);
                const tier = LOYALTY.TIERS[tierKey];
                const points = c.loyaltyPoints || 0;
                const subtotal = window.erpState.cart.reduce((a, b) => a + (b.price * b.qty), 0);
                const disc = window.erpState.activeDiscountAmt || 0;
                const total = subtotal - disc;
                const potential = window.calcPoints(total, tierKey);

                loyPreview.classList.remove('hidden');
                loyPreview.innerHTML = `
                    <div class="flex items-center justify-between mb-4">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 bg-${tier.color}-500/20 rounded-xl flex items-center justify-center text-${tier.color}-400">
                                <i data-lucide="star" class="w-5 h-5"></i>
                            </div>
                            <div>
                                <p class="text-[10px] font-black text-white uppercase tracking-widest">${tier.label} Member</p>
                                <p class="text-[9px] font-bold text-slate-500 uppercase mt-0.5">Current Balance: ${points} pts</p>
                            </div>
                        </div>
                        <div class="text-right">
                            <p id="cm_earned_pts" class="text-emerald-400 font-black text-lg">+${potential}</p>
                            <p class="text-[8px] font-bold text-slate-500 uppercase">Points to Earn</p>
                        </div>
                    </div>
                    
                    ${points >= LOYALTY.MIN_REDEMPTION ? `
                        <div class="pt-4 border-t border-slate-800 flex items-center justify-between">
                            <div class="flex flex-col">
                                <span class="text-[8px] font-black text-slate-400 uppercase tracking-widest">Redemption Available</span>
                                <span class="text-[7px] text-slate-500 font-bold uppercase mt-0.5">1 Point = ₹1</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <input type="number" id="cm_redeem_amt" max="${points}" oninput="window.updateCMFinal(${subtotal})" placeholder="0" class="w-20 px-3 py-1.5 bg-slate-800 border-none rounded-lg text-white font-black text-xs outline-none focus:ring-1 focus:ring-violet-500">
                                <span class="text-[10px] font-black text-slate-400 uppercase">PTS</span>
                            </div>
                        </div>
                    ` : `
                        <p class="text-[7px] font-black text-slate-600 uppercase tracking-widest text-center mt-2 italic">Need ${LOYALTY.MIN_REDEMPTION - points} more pts to unlock redemption</p>
                    `}
                `;
                if (window.lucide) lucide.createIcons();
            }
        }
    };

    window.shareWhatsApp = (billNo, name, phone, total, balance = 0) => {
        const sale = window.erpState.sales.find(s => s.billNo === billNo);
        const order = window.erpState.orders.find(o => o.billNo === billNo);
        const client = window.erpState.clients.find(c => c.phone === (phone || sale?.customerPhone || order?.phone));
        
        const data = {
            customerName: name || sale?.customerName || order?.customerName || 'Customer',
            billNo: billNo,
            totalCost: (total || sale?.total || order?.totalCost || 0).toLocaleString('en-IN'),
            advancePaid: (total - (balance || 0)).toLocaleString('en-IN'),
            balance: (balance || 0).toLocaleString('en-IN'),
            deliveryDate: sale ? new Date(sale.date).toLocaleDateString() : (order ? window.fmtDate(order.deliveryDate) : 'N/A'),
            pointsEarned: sale?.loyaltySnapshot?.earned || order?.loyaltySnapshot?.earned || 0,
            totalPoints: client?.loyaltyPoints || 0,
            tier: (client?.tier || 'Basic').toUpperCase()
        };

        const templates = window.erpState.whatsappTemplates || {};
        let tpl = balance > 0 ? (templates.ready || templates.booking) : templates.delivered;
        
        if (!tpl) {
            tpl = `Hi {customerName},\n\nThank you for shopping at *Lavish Lavender*!\n\nYour bill *{billNo}* for *₹{totalCost}* is confirmed. {balance != "0" ? 'Remaining: *₹{balance}*' : ''}\n\n✨ *Loyalty Info*\nTier: {tier}\nPoints: {totalPoints}\n\nView details: https://www.lavishlavender.in/receipt/?bill={billNo}`;
        }

        const msg = encodeURIComponent(fillTemplate(tpl, data));
        const cleanPhone = (phone || "").toString().replace(/\D/g, '');
        const target = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;
        if (target) window.open(`https://wa.me/${target}?text=${msg}`, '_blank');
    };

    window.sendReminder = (billNo, name, phone, balance) => {
        const client = window.erpState.clients.find(c => c.phone === phone);
        const data = {
            customerName: name || 'Customer',
            billNo: billNo,
            balance: (balance || 0).toLocaleString('en-IN'),
            points: client?.points || 0,
            tier: (client?.tier || 'Basic').toUpperCase()
        };
        const templates = window.erpState.whatsappTemplates || {};
        const tpl = templates.reminder || `Friendly reminder from *Lavish Lavender* regarding bill *{billNo}*.\n\nPending balance: *₹{balance}*.\n\nThank you!`;
        
        const msg = encodeURIComponent(fillTemplate(tpl, data));
        const cleanPhone = (phone || "").toString().replace(/\D/g, '');
        const target = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;
        if (target) window.open(`https://wa.me/${target}?text=${msg}`, '_blank');
    };

    window.saveGeneralSettings = async () => {
        try {
            await window.FB.collection('settings').doc('general').set({
                printerWidth: window.erpState.printerWidth || '58',
                printerConfig: window.erpState.printerConfig || null,
                whatsappTemplates: window.erpState.whatsappTemplates || null,
                taxes: window.erpState.taxes,
                discounts: window.erpState.discounts,
                menuOrder: (window.erpState.menuItems || []).map(i => i.id),
                passwords: window.erpState.passwords,
                staff: window.erpState.staff || [],
                loyalty: window.erpState.loyalty,
                updatedAt: Date.now()
            }, { merge: true });
        } catch (e) {
            console.error("Failed to save settings:", e);
        }
    };

    window.saveLoyaltySettings = () => {
        const enabled = document.getElementById('loyalty_enabled').checked;
        const pts = parseFloat(document.getElementById('loyalty_pts').value) || 5;
        const elite = parseFloat(document.getElementById('loyalty_elite').value) || 10000;
        const gold = parseFloat(document.getElementById('loyalty_gold').value) || 50000;

        window.erpState.loyalty = {
            enabled: enabled,
            pointsPer100: pts,
            eliteThreshold: elite,
            goldThreshold: gold
        };
        
        window.saveGeneralSettings();
        alert("Loyalty parameters updated.");
    };

    window.updatePasswords = () => {
        const staff = document.getElementById('pass_staff').value.trim();
        const owner = document.getElementById('pass_owner').value.trim();
        if(!staff || !owner) return alert("Passwords cannot be empty");
        
        window.erpState.passwords = { staff, owner };
        window.saveGeneralSettings();
        alert("Admin Credentials Updated Successfully!");
        window.renderApp();
    };

    window.openAddStaff = () => {
        const modal = document.createElement('div');
        modal.id = 'staff-modal-overlay';
        modal.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[700] p-4";
        modal.innerHTML = `
            <div class="bg-white w-full max-w-sm rounded-[40px] p-8 shadow-2xl animate-pop-in border border-slate-100 relative overflow-hidden">
                <div class="absolute -right-6 -top-6 w-32 h-32 bg-indigo-50 rounded-full blur-3xl opacity-50"></div>
                
                <div class="flex items-center gap-3 mb-8 relative">
                    <div class="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-100">
                        <i data-lucide="user-plus" class="w-6 h-6"></i>
                    </div>
                    <div>
                        <h3 class="text-xl font-black text-slate-900 tracking-tighter uppercase mb-0.5">Enroll Staff</h3>
                        <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Add New Terminal Operator</p>
                    </div>
                </div>

                <div class="space-y-5 mb-8 relative">
                    <div>
                        <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Full Name</label>
                        <input id="staff_name" type="text" placeholder="e.g. Swaliha K" class="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-base outline-none focus:border-indigo-500 shadow-inner">
                    </div>
                    <div>
                        <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Access Code (4 Digits)</label>
                        <input id="staff_code" type="password" maxlength="4" placeholder="••••" class="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-2xl tracking-[0.5em] text-center outline-none focus:border-indigo-500 shadow-inner">
                    </div>
                </div>

                <div class="flex gap-3 relative">
                    <button onclick="document.getElementById('staff-modal-overlay').remove()" class="flex-1 py-4 bg-slate-100 text-slate-400 rounded-2xl font-black uppercase text-[10px] tracking-widest">Cancel</button>
                    <button onclick="window.enrollStaff()" class="flex-[2] py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl hover:bg-indigo-600 transition-all active:scale-95">Verify & Enroll</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        if (window.lucide) lucide.createIcons();
        document.getElementById('staff_name').focus();
    };

    window.enrollStaff = async () => {
        const name = document.getElementById('staff_name').value.trim();
        const code = document.getElementById('staff_code').value.trim();

        if (!name || code.length !== 4) return alert("Please enter a valid Name and 4-digit Code.");

        const staff = window.erpState.staff || [];
        if (staff.find(s => s.code === code)) return alert("This Access Code is already assigned to someone else.");

        staff.push({ name, code });
        window.erpState.staff = staff;

        const btn = document.querySelector("#staff-modal-overlay button.bg-slate-900");
        btn.innerText = "ENROLLING..."; btn.disabled = true;

        await window.saveGeneralSettings();
        document.getElementById('staff-modal-overlay').remove();
        window.renderApp();
    };

    window.deleteStaff = async (idx) => {
        if (!confirm("Are you sure you want to remove this staff member? All their historical sales remains, but they will no longer have access.")) return;
        
        window.erpState.staff.splice(idx, 1);
        await window.saveGeneralSettings();
        window.renderApp();
    };

    window.addTaxRule = () => {
        const lab = document.getElementById('new_tax_label').value.trim();
        const val = parseFloat(document.getElementById('new_tax_val').value);
        if(!lab || isNaN(val)) return;
        window.erpState.taxes.push({ label: lab, val });
        window.saveGeneralSettings();
        window.renderApp();
    };

    window.deleteTaxRule = (idx) => {
        window.erpState.taxes.splice(idx, 1);
        window.saveGeneralSettings();
        window.renderApp();
    };

    window.addDiscountRule = () => {
        const lab = document.getElementById('new_disc_label').value.trim();
        const val = parseFloat(document.getElementById('new_disc_val').value);
        const type = document.getElementById('new_disc_type').value;
        if(!lab || isNaN(val)) return;
        window.erpState.discounts.push({ label: lab, val, type });
        window.saveGeneralSettings();
        window.renderApp();
    };

    window.deleteDiscountRule = (idx) => {
        window.erpState.discounts.splice(idx, 1);
        window.saveGeneralSettings();
        window.renderApp();
    };

    window.openClientProfile = (id) => {
        const c = (window.erpState.clients || []).find(x => x.id === id);
        if(!c) return;
        
        const modal = document.createElement("div");
        modal.className = "fixed inset-0 bg-slate-900/90 backdrop-blur-2xl flex justify-center items-center z-[600] p-4";
        modal.innerHTML = `
            <div class="bg-white w-full max-w-lg rounded-[56px] p-12 shadow-2xl animate-pop-in relative overflow-hidden">
                <div class="absolute -right-16 -top-16 w-64 h-64 bg-indigo-50 rounded-full blur-3xl opacity-50"></div>
                
                <div class="flex items-center gap-6 mb-12 relative">
                    <div class="w-24 h-24 bg-slate-900 text-white rounded-[40px] flex items-center justify-center font-black text-4xl shadow-2xl">
                        ${c.name ? c.name.charAt(0).toUpperCase() : '?'}
                    </div>
                    <div>
                        <h2 class="text-3xl font-black text-slate-900 tracking-tighter uppercase mb-1">${c.name}</h2>
                        <p class="text-indigo-600 font-bold text-sm font-mono tracking-widest">${c.phone}</p>
                    </div>
                </div>

                <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-12 relative">
                    <div class="p-6 bg-slate-50 rounded-[32px] border border-slate-100 bg-white/50">
                        <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Current Tier</p>
                        <div class="flex items-center gap-2">
                            <i data-lucide="star" class="w-4 h-4 text-${window.LOYALTY?.TIERS[c.tier || 'basic']?.color || 'slate'}-500"></i>
                            <p class="font-black text-slate-800 uppercase tracking-tight text-sm">${window.LOYALTY?.TIERS[c.tier || 'basic']?.label || 'Basic'}</p>
                        </div>
                    </div>
                    <div class="p-6 bg-slate-50 rounded-[32px] border border-slate-100 bg-white/50">
                        <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Total Points</p>
                        <p class="font-black text-indigo-600 uppercase tracking-tight text-lg">${c.loyaltyPoints || 0}</p>
                    </div>
                    <div class="p-6 bg-slate-50 rounded-[32px] border border-slate-100 bg-white/50">
                        <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Total Spent</p>
                        <p class="font-black text-slate-800 uppercase tracking-tight text-sm">${window.fmt(c.totalSpent || 0)}</p>
                    </div>
                    <div class="p-6 bg-slate-50 rounded-[32px] border border-slate-100 bg-white/50">
                        <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Member Since</p>
                        <p class="font-black text-slate-500 uppercase tracking-tight text-[10px]">${new Date(c.createdAt || Date.now()).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</p>
                    </div>
                </div>

                <div class="space-y-4 relative">
                    <button onclick="window.shareWhatsApp('', '${c.name}', '${c.phone}', 0)" class="w-full py-5 bg-emerald-500 text-white rounded-[28px] font-black uppercase text-[10px] tracking-[0.2em] shadow-xl shadow-emerald-200 flex items-center justify-center gap-3">
                         <i data-lucide="message-circle" class="w-5 h-5"></i> Contact via WhatsApp
                    </button>
                    <button onclick="this.closest('.fixed').remove()" class="w-full py-5 bg-slate-100 text-slate-400 rounded-[28px] font-black uppercase text-[10px] tracking-widest">Close Profile</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        lucide.createIcons();
    };

    window.exportAreaReport = function (type) {
        if (typeof XLSX === 'undefined') return alert("Excel Library not loaded yet.");
        
        let data = [];
        const filter = window.erpState.dashboardFilter || 'all';
        const now = new Date();
        let start = 0;

        if (filter === 'today') start = new Date().setHours(0,0,0,0);
        else if (filter === 'weekly') start = now.getTime() - (7 * 24 * 60 * 60 * 1000);
        else if (filter === 'monthly') start = now.getTime() - (30 * 24 * 60 * 60 * 1000);

        const wb = XLSX.utils.book_new();

        if (type === 'sales' || type === 'master') {
            const raw = (window.erpState.sales || []).filter(s => s.date >= start);
            data = raw.map(s => ({
                Date: new Date(s.date).toLocaleDateString(),
                BillNo: s.billNo,
                Customer: s.customerName,
                Phone: s.customerPhone,
                Total: s.total,
                Paid: s.advancePaid,
                Due: s.balanceDue,
                Method: s.paymentMode || s.paymentMethod
            }));
            if (data.length || type !== 'master') {
                const ws = XLSX.utils.json_to_sheet(data);
                XLSX.utils.book_append_sheet(wb, ws, "Sales");
            }
        }

        if (type === 'expenses' || type === 'master') {
            const raw = (window.erpState.expenses || []).filter(e => e.date >= start);
            data = raw.map(e => ({
                Date: new Date(e.date).toLocaleDateString(),
                Category: e.category,
                Amount: e.amount,
                Note: e.notes || e.note,
                BillRef: e.billNo || ''
            }));
            if (data.length || type !== 'master') {
                const ws = XLSX.utils.json_to_sheet(data);
                XLSX.utils.book_append_sheet(wb, ws, "Expenses");
            }
        }

        if (type === 'dues' || type === 'master') {
            const raw = (window.erpState.sales || []).filter(s => s.balanceDue > 0);
            data = raw.map(s => ({
                BillNo: s.billNo,
                Customer: s.customerName,
                Phone: s.customerPhone,
                Total: s.total,
                Paid: s.advancePaid,
                Due: s.balanceDue
            }));
            if (data.length || type !== 'master') {
                const ws = XLSX.utils.json_to_sheet(data);
                XLSX.utils.book_append_sheet(wb, ws, "Pending Dues");
            }
        }

        if (type === 'inventory' || type === 'master') {
            data = (window.erpState.items || []).map(i => ({
                SKU: i.sku,
                Name: i.name,
                Category: i.category,
                Cost: i.costPrice,
                Price: i.sellingPrice,
                Stock: i.stock
            }));
            if (data.length || type !== 'master') {
                const ws = XLSX.utils.json_to_sheet(data);
                XLSX.utils.book_append_sheet(wb, ws, "Inventory");
            }
        }

        if (type === 'clients') {
            data = (window.erpState.clients || []).map(c => ({
                Name: c.name,
                Phone: c.phone,
                Registered: new Date(c.createdAt || Date.now()).toLocaleDateString()
            }));
            const ws = XLSX.utils.json_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, "Clients");
        }

        XLSX.writeFile(wb, `Lavish_Lavender_${type}_Report_${filter}.xlsx`);
    };

    window.openDyeModal = (it) => {
        var modal = document.createElement("div");
        modal.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center overflow-y-auto p-0 sm:p-4 z-[600]";
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
        modal.innerHTML = `
            <div class="bg-white w-full sm:max-w-sm sm:rounded-[40px] rounded-t-[40px] p-8 shadow-2xl animate-slide-up sm:animate-pop-in relative my-auto max-h-[90vh] overflow-y-auto">
                <div class="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4 sm:hidden"></div>
                <button onclick="this.closest('.fixed').remove()" class="absolute top-8 right-8 w-8 h-8 flex items-center justify-center bg-slate-50 text-slate-400 rounded-xl hover:bg-slate-100 transition-colors">
                    <i data-lucide="x" class="w-4 h-4"></i>
                </button>
                <div class="flex items-center gap-3 mb-1">
                    <div class="w-10 h-10 bg-violet-100 text-violet-600 rounded-xl flex items-center justify-center">
                        <i data-lucide="droplets" class="w-6 h-6"></i>
                    </div>
                    <h2 class="font-black text-lg text-slate-800">${it.name}</h2>
                </div>
                <p class="text-[10px] text-slate-400 font-black mb-6 uppercase tracking-[0.2em] ml-1">Dye Process Automation</p>
                
                <div class="space-y-4 mb-8">
                    <div>
                        <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">Quantity</label>
                        <input id="dye_qty" type="number" value="1" step="0.01" class="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-base text-slate-800 outline-none focus:border-violet-500 transition-all">
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">Selling (Cart)</label>
                            <input id="dye_sell" type="number" placeholder="0.00" class="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-base text-violet-600 outline-none focus:border-violet-500 transition-all">
                        </div>
                        <div>
                            <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">Cost (Expense)</label>
                            <input id="dye_cost" type="number" placeholder="0.00" class="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-base text-rose-500 outline-none focus:border-violet-500 transition-all">
                        </div>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <button id="dye_manual" class="py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all">Do Manually</button>
                    <button id="dye_ok" class="py-4 bg-violet-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-violet-100 hover:bg-violet-700 transition-all active:scale-95">OK</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        if (window.lucide) lucide.createIcons();

        document.getElementById('dye_sell').focus();
        document.getElementById('dye_manual').onclick = () => { modal.remove(); window.addCart(it.sku, true); };
        
        document.getElementById('dye_ok').onclick = async () => {
            const qty = parseFloat(document.getElementById('dye_qty').value || 1);
            const sell = parseFloat(document.getElementById('dye_sell').value || 0);
            const cost = parseFloat(document.getElementById('dye_cost').value || 0);
            if (sell <= 0) return alert("Selling price required");
            if (qty <= 0) return alert("Valid quantity required");

            const btn = document.getElementById('dye_ok');
            btn.innerText = "SAVING..."; btn.disabled = true;

            const existing = window.erpState.cart.find(x => x.sku === it.sku && x.price === sell);
            if (existing) {
                existing.qty += qty;
            } else {
                window.erpState.cart.push({ sku: it.sku, id: it.id, name: it.name, price: sell, cost: cost, qty: qty });
            }

            if (cost > 0) {
                try {
                    await window.FB.collection('expenses').add({
                        category: "Dye Charge",
                        amount: cost * qty,
                        notes: `Dyeing automation for: ${it.name} (${qty} units)`,
                        date: Date.now(),
                        requireBill: false
                    });
                } catch(e) { console.error("Expense error:", e); }
            }
            modal.remove();
            window.renderApp();
        };
    };

    window.openStitchingModal = async (it) => {
        var modal = document.createElement("div");
        modal.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center overflow-y-auto p-0 sm:p-4 z-[600]";
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

        const today = new Date();
        const delivery = new Date(today);
        delivery.setDate(today.getDate() + 10);
        const deliveryStr = delivery.toISOString().split('T')[0];

        modal.innerHTML = `
            <div class="bg-white rounded-t-[40px] sm:rounded-[40px] p-8 w-full sm:max-w-sm animate-slide-up sm:animate-pop-in shadow-2xl my-auto relative max-h-[90vh] overflow-y-auto">
                <div class="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4 sm:hidden"></div>
                <button onclick="this.closest('.fixed').remove()" class="absolute top-8 right-8 w-8 h-8 flex items-center justify-center bg-slate-50 text-slate-400 rounded-xl hover:bg-slate-100 transition-colors">
                    <i data-lucide="x" class="w-4 h-4"></i>
                </button>
                <div class="flex items-center gap-3 mb-1">
                    <div class="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
                        <i data-lucide="scissors" class="w-6 h-6"></i>
                    </div>
                    <h2 class="font-black text-lg text-slate-800 uppercase tracking-tight">${it.name}</h2>
                </div>
                <p class="text-[10px] text-slate-400 font-black mb-6 uppercase tracking-[0.2em] ml-1">Stitching Terminal Update</p>
                
                <div class="space-y-4 mb-6">
                    <div>
                        <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">Tailoring Bill No</label>
                        <div class="flex items-center bg-slate-50 border-2 border-slate-100 rounded-2xl overflow-hidden focus-within:border-indigo-500 transition-all">
                            <span class="px-5 py-4 font-black text-lg text-slate-400 bg-slate-100 border-r-2 border-slate-100">B-</span>
                            <input id="stitch_bill_num" type="number" placeholder="..." class="flex-1 px-4 py-4 bg-transparent font-black text-lg text-slate-800 outline-none">
                        </div>
                        <p id="stitch_status" class="text-[9px] font-bold mt-2 ml-1 text-slate-400 transition-all">&nbsp;</p>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">Service Price</label>
                            <input id="stitch_price" type="number" value="${it.sellingPrice || 0}" class="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-base text-indigo-600 outline-none focus:border-indigo-500 transition-all">
                        </div>
                        <div>
                            <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">Delivery Date</label>
                            <input id="stitch_date" type="date" value="${deliveryStr}" class="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs text-slate-800 outline-none focus:border-indigo-500 transition-all">
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-3">
                    <button id="stitch_manual" class="py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all">Do Manually</button>
                    <button id="stitch_ok" class="py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all">Link Order</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        if (window.lucide) lucide.createIcons();

        async function checkBillAvailability(val) {
            const statusEl = document.getElementById('stitch_status');
            if (!val) { statusEl.innerHTML = '&nbsp;'; return; }
            statusEl.innerText = "Checking..."; statusEl.className = "text-[9px] font-bold mt-2 ml-1 text-slate-400";
            try {
                const snap = await window.FB.root('orders').where('billNo', '==', "B-" + val).get();
                if (!snap.empty) {
                    const data = snap.docs[0].data();
                    statusEl.innerText = `Belongs to: ${data.customerName || 'Unknown'}`;
                    statusEl.className = "text-[9px] font-black mt-2 ml-1 text-amber-500 animate-pulse";
                } else {
                    statusEl.innerText = "Available: New Order will be created.";
                    statusEl.className = "text-[9px] font-black mt-2 ml-1 text-emerald-500";
                }
            } catch (e) { console.error(e); }
        }

        let debounceTimer;
        document.getElementById('stitch_bill_num').oninput = (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => checkBillAvailability(e.target.value), 500);
        };

        async function fetchLastB() {
            try {
                const orders = window.erpState.orders || [];
                const sortedOrders = [...orders].filter(o => o.createdAt).sort((a,b) => {
                    const timeA = typeof a.createdAt === 'number' ? a.createdAt : (a.createdAt?.toMillis ? a.createdAt.toMillis() : 0);
                    const timeB = typeof b.createdAt === 'number' ? b.createdAt : (b.createdAt?.toMillis ? b.createdAt.toMillis() : 0);
                    return timeB - timeA;
                });
                
                let lastNum = 100;
                if (sortedOrders.length > 0) {
                    const latestBillNo = sortedOrders[0].billNo || "";
                    const match = latestBillNo.match(/\d+/);
                    if (match) lastNum = parseInt(match[0]);
                }
                
                const cartNums = window.erpState.cart.map(c => parseInt((c.tailoringRef || '').replace(/\D/g, '') || 0)).filter(n => n > 0);
                const next = Math.max(lastNum, ...cartNums, 0) + 1;
                
                const el = document.getElementById('stitch_bill_num');
                if (el) { el.value = next; checkBillAvailability(next); }
            } catch (e) { console.error(e); }
        }
        fetchLastB();

        document.getElementById('stitch_manual').onclick = () => { modal.remove(); window.addCart(it.sku, true); };

        document.getElementById('stitch_ok').onclick = async () => {
            const num = document.getElementById('stitch_bill_num').value;
            if (!num || num === '...') return alert("Wait for Bill No");
            const billNo = "B-" + num;
            const dDate = document.getElementById('stitch_date').value;
            const sPrice = parseFloat(document.getElementById('stitch_price').value || 0);

            if (!dDate) return alert("Select Date.");
            if (sPrice <= 0) return alert("Enter valid Price.");

            const btn = document.getElementById('stitch_ok');
            btn.innerText = "LINKING..."; btn.disabled = true;

            try {
                const snap = await window.FB.root('orders').where('billNo', '==', billNo).get();
                if (!snap.empty) {
                    const existing = snap.docs[0].data();
                    if (!confirm(`Bill ${billNo} already exists for customer: ${existing.customerName}. Link?`)) {
                        btn.innerText = "Link Order"; btn.disabled = false; return;
                    }
                } else {
                    await window.FB.root('orders').add({
                        billNo, customerName: "POS Pending", phone: "", orderDate: new Date().toISOString().split('T')[0],
                        deliveryDate: dDate, status: "Order Confirmed", items: [{ name: it.name, price: sPrice, tailoring: true }],
                        totalCost: sPrice, advancePaid: 0, createdAt: window.FB.Timestamp.now(),
                        source: 'pos',
                        notesLog: [{ text: "Pre-linked via POS Terminal (Stub)", timestamp: new Date().toLocaleString() }]
                    });
                }

                let ex = window.erpState.cart.find(x => x.sku === it.sku && x.tailoringRef === billNo);
                if (ex) {
                    ex.qty += 1; ex.price = sPrice;
                } else {
                    window.erpState.cart.push({
                        sku: it.sku, id: it.id, name: it.name + " (" + billNo + ")", price: sPrice, cost: it.costPrice || 0, qty: 1,
                        tailoringRef: billNo, tailoringBillNo: billNo, deliveryDate: dDate
                    });
                }
                modal.remove();
                window.renderApp();
            } catch(e) {
                console.error(e);
                alert("Linking failed.");
                btn.innerText = "Link Order"; btn.disabled = false;
            }
        };
    };

    window.toggleHistorySort = function() {
        window.erpState.historySort = window.erpState.historySort === 'desc' ? 'asc' : 'desc';
        window.scheduleRender();
    };

    window.saveLoyaltySettings = async () => {
        const config = {
            enabled: document.getElementById('loyalty_enabled').checked,
            tiers: {
                basic: { pct: parseFloat(document.getElementById('loy_pct_basic').value || 2) / 100 },
                silver: { pct: parseFloat(document.getElementById('loy_pct_silver').value || 3) / 100 },
                gold: { pct: parseFloat(document.getElementById('loy_pct_gold').value || 5) / 100 },
                premium: { pct: parseFloat(document.getElementById('loy_pct_premium').value || 5) / 100 }
            }
        };
        window.erpState.loyalty = config;
        // Update live constants
        window.LOYALTY.TIERS.basic.pct = config.tiers.basic.pct;
        window.LOYALTY.TIERS.silver.pct = config.tiers.silver.pct;
        window.LOYALTY.TIERS.gold.pct = config.tiers.gold.pct;
        window.LOYALTY.TIERS.premium.pct = config.tiers.premium.pct;

        window.renderApp();
        try {
            await window.FB.collection('settings').doc('general').set({ loyalty: config }, { merge: true });
            alert("Loyalty Configuration Synchronized.");
        } catch(e) { console.error(e); }
    };

    window.syncLegacyLoyalty = async (e) => {
        if (!confirm("This will scan ALL historic sales and tailoring orders to recalculate loyalty points and tiers for every client. Proceed?")) return;
        
        const btn = e.target;
        const orig = btn.innerText;
        btn.innerText = "Processing Logic..."; btn.disabled = true;

        try {
            // 1. Collect all transactions
            const sales = (window.erpState.sales || []).map(s => ({ 
                phone: s.customerPhone, 
                amount: s.total || 0, 
                date: s.date || 0
            }));
            
            const orders = (window.erpState.orders || []).map(o => {
                const d = o.createdAt?.toMillis ? o.createdAt.toMillis() : (o.createdAt?.toDate ? o.createdAt.toDate().getTime() : (o.timestamp || 0));
                return {
                    phone: o.phone,
                    amount: o.totalCost || 0,
                    date: d
                };
            });

            const allTx = [...sales, ...orders].filter(t => t.phone && t.phone.toString().replace(/\D/g, '').length >= 10);
            allTx.sort((a,b) => (a.date || 0) - (b.date || 0));

            // 2. Group and Calculate
            const groups = {};
            allTx.forEach(t => {
                if (!groups[t.phone]) groups[t.phone] = [];
                groups[t.phone].push(t);
            });

            const db = window.FB.db;
            const batch = db.batch();
            const clientCol = window.FB.root('clients');
            let count = 0;

            for (const phone in groups) {
                let currentSpent = 0;
                let currentPoints = 0;
                
                groups[phone].forEach(tx => {
                    const tier = window.getLoyaltyTier(currentSpent);
                    currentPoints += window.calcPoints(tx.amount, tier);
                    currentSpent += tx.amount;
                });

                const finalTier = window.getLoyaltyTier(currentSpent);
                const client = window.erpState.clients.find(c => c.phone === phone);
                
                if (client) {
                    batch.update(clientCol.doc(client.id), {
                        loyaltyPoints: currentPoints,
                        totalSpent: currentSpent,
                        tier: finalTier,
                        loyaltyMigrated: true
                    });
                    count++;
                }
            }

            await batch.commit();
            alert(`Successfully migrated ${count} clients. Tiers and points are now up-to-date!`);
        } catch(err) {
            console.error(err);
            alert('Migration Error: ' + err.message);
        } finally {
            btn.innerText = orig; btn.disabled = false;
        }
    };
})();
