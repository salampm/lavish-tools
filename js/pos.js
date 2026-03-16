
// POS Shared Logic & State Management
(function() {
    // Re-bind helpers for convenience
    const fmt = window.fmt;
    const db = window.FB?.db;

    const DATA_PATH = (col) => {
        if (col === 'clients') return window.FB.root(col);
        return window.FB.collection(col);
    };

    // --- POS RENDERER ---
    window.renderPOS = function () {
        const cartSubtotal = window.erpState.cart.reduce((a, b) => a + (b.price * b.qty), 0);
        const cartCount = window.erpState.cart.reduce((a, b) => a + b.qty, 0);
        
        // Tab switching within POS
        let content = '';
        switch(window.erpState.tab) {
            case 'pos': content = renderPOSTerminal(); break;
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
                    <input type="text" 
                        oninput="window.erpState.search=this.value; window.scheduleRender()" 
                        placeholder="Search products by name or SKU..." 
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
                        const s = (window.erpState.search || '').toLowerCase();
                        const cat = window.erpState.categoryFilter;
                        return (!s || i.name.toLowerCase().includes(s) || (i.sku && i.sku.toLowerCase().includes(s))) && 
                               (!cat || i.category === cat);
                    })
                    .map(it => `
                    <button onclick="window.addCart('${it.sku}')" class="bg-white p-4 md:p-5 rounded-3xl md:rounded-[32px] border border-slate-100 shadow-sm hover:border-violet-500 hover:shadow-xl hover:shadow-violet-500/10 transition-all text-left flex flex-col h-36 md:h-44 relative group">
                        <div class="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity hidden md:block">
                            <i data-lucide="plus-circle" class="w-5 h-5 text-violet-500"></i>
                        </div>
                        <span class="text-[9px] md:text-[10px] font-black uppercase text-slate-400 mb-1 tracking-widest">${it.sku || 'ITEM'}</span>
                        <h3 class="font-bold text-slate-800 text-xs md:text-sm mb-auto line-clamp-2 leading-tight">${it.name}</h3>
                        <div class="mt-2 text-right md:text-left">
                            <p class="text-violet-600 font-black text-base md:text-lg">${fmt(it.sellingPrice)}</p>
                            ${it.stock <= 5 ? `<p class="text-[8px] md:text-[9px] font-black text-rose-500 uppercase mt-1">Low Stock: ${it.stock}</p>` : `<p class="text-[8px] md:text-[9px] font-bold text-slate-400 uppercase mt-1">Stock: ${it.stock}</p>`}
                        </div>
                    </button>
                    `).join('')}
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

    // --- POS ACTIONS ---

    window.addCart = function (sku, bypassDye = false) {
        const it = window.erpState.items.find(x => x.sku === sku);
        if (!it) return;

        // Custom workflows for special items
        if (!bypassDye && (it.category === 'DYE' || it.name.toLowerCase().includes('dye-work'))) {
            return window.openDyeModal(it);
        }
        if (!bypassDye && (it.category === 'STITCHING' || it.name.toLowerCase().includes('service-stitching'))) {
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

    // --- REVENUE TRACKERS --- (Imported from POS.html)

    function renderHistory() {
        const historySearch = (window.erpState.historySearch || '').toLowerCase();
        let list = (window.erpState.sales || []).sort((a,b) => (b.date || 0) - (a.date || 0));
        
        // Date filters
        const now = new Date();
        const todayStart = new Date().setHours(0,0,0,0);
        let start = 0;
        
        const filter = window.erpState.historyFilter || 'all';

        if(filter === 'today') start = todayStart;
        else if(filter === 'week') start = now.getTime() - (7 * 24 * 60 * 60 * 1000);
        else if(filter === 'month') start = now.getTime() - (30 * 24 * 60 * 60 * 1000);
        else if(filter === 'custom' && window.erpState.historyCustomStart) {
            start = new Date(window.erpState.historyCustomStart).getTime();
        }

        list = list.filter(s => s.date >= start);
        if(window.erpState.historyCustomEnd && filter === 'custom') {
            const end = new Date(window.erpState.historyCustomEnd).setHours(23,59,59,999);
            list = list.filter(s => s.date <= end);
        }

        if(historySearch){
            list = list.filter(s => 
                (s.billNo || '').toLowerCase().includes(historySearch) || 
                (s.customerPhone || '').includes(historySearch) || 
                (s.customerName || '').toLowerCase().includes(historySearch)
            );
        }

        return `
        <div class="flex flex-col h-full bg-slate-50">
            <div class="sticky top-0 z-10 bg-white/80 backdrop-blur-md p-6 border-b border-slate-200">
                <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-6 max-w-[1400px] mx-auto">
                    <div>
                        <h2 class="text-2xl font-black text-slate-800 tracking-tighter uppercase mb-1">Sales Ledger <span class="text-violet-600">v2.0</span></h2>
                        <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">${list.length} Records Found</p>
                    </div>

                    <div class="flex flex-wrap items-center gap-4">
                        <div class="relative min-w-[280px]">
                            <i data-lucide="search" class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4"></i>
                            <input type="text" placeholder="Search Bill No / Phone / Name..." value="${window.erpState.historySearch || ''}" class="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-violet-500/20 shadow-sm" oninput="window.erpState.historySearch=this.value; window.scheduleRender()">
                        </div>

                        <div class="flex bg-slate-100 p-1 rounded-2xl">
                            ${['all', 'today', 'week', 'month', 'custom'].map(f => `
                                <button onclick="window.erpState.historyFilter='${f}'; window.renderApp();" class="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filter === f ? 'bg-white text-violet-600 shadow-md ring-1 ring-black/5' : 'text-slate-400 hover:text-slate-600'}">${f}</button>
                            `).join('')}
                        </div>

                        ${filter === 'custom' ? `
                            <div class="flex items-center gap-2 animate-pop-in">
                                <input type="date" value="${window.erpState.historyCustomStart || ''}" onchange="window.erpState.historyCustomStart=this.value; window.renderApp();" class="px-3 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-bold outline-none">
                                <span class="text-slate-300 font-black">TO</span>
                                <input type="date" value="${window.erpState.historyCustomEnd || ''}" onchange="window.erpState.historyCustomEnd=this.value; window.renderApp();" class="px-3 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-bold outline-none">
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>

            <div class="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
                <div class="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden flex flex-col max-w-[1400px] mx-auto">
                    <div class="bg-slate-50/50 border-b border-slate-100 px-8 py-4 hidden md:grid grid-cols-[180px_1fr_100px_120px_120px] gap-4 items-center uppercase tracking-[0.2em] text-[10px] font-black text-slate-400">
                        <div>Bill & Date</div>
                        <div>Customer Name</div>
                        <div>Items</div>
                        <div class="text-right">Final Total</div>
                        <div class="text-right">Balance Due</div>
                    </div>

                    <div class="divide-y divide-slate-50">
                        ${list.length === 0 ? `<div class="py-24 text-center text-slate-300 font-bold italic">No receipts found.</div>` :
                            list.map(s => `
                                <div onclick="window.openReceipt('${s.id}')" class="px-8 py-5 grid grid-cols-2 md:grid-cols-[180px_1fr_100px_120px_120px] gap-x-4 gap-y-2 items-center hover:bg-slate-50/50 cursor-pointer transition-colors group">
                                    <div>
                                        <p class="text-base font-black text-slate-800 leading-tight group-hover:text-violet-600 transition-colors">${s.billNo}</p>
                                        <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">${new Date(s.date).toLocaleDateString()}</p>
                                    </div>
                                    <div>
                                        <p class="text-sm font-black text-slate-700 capitalize">${s.customerName || 'Walk-in'}</p>
                                        <p class="text-[10px] font-bold text-slate-400 truncate">${s.customerPhone || ''}</p>
                                    </div>
                                    <div class="flex flex-col gap-1">
                                        <span class="px-2 py-1 bg-violet-50 text-violet-600 rounded-lg text-[9px] font-black uppercase tracking-wider w-fit">${(s.items || []).length} items</span>
                                    </div>
                                    <div class="text-base font-black text-slate-900 text-right">${fmt(s.total)}</div>
                                    <div class="text-base font-black ${s.balanceDue > 0 ? 'text-rose-500' : 'text-emerald-500'} text-right">
                                        ${s.balanceDue > 0 ? fmt(s.balanceDue) : '<span class="px-2 py-1 bg-emerald-50 rounded-lg text-[10px]">PAID</span>'}
                                    </div>
                                </div>`).join('')
                        }
                    </div>
                </div>
            </div>
        </div>
        `;
    }

    function renderPendingDues() {
        const dueSearch = (window.erpState.dueSearch || '').toLowerCase();
        const list = (window.erpState.sales || [])
            .filter(s => (s.balanceDue || 0) > 0)
            .filter(s => !dueSearch || (s.billNo || '').toLowerCase().includes(dueSearch) || (s.customerPhone || '').includes(dueSearch) || (s.customerName || '').toLowerCase().includes(dueSearch))
            .sort((a,b) => b.balanceDue - a.balanceDue);

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

            <div class="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
                <div class="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden flex flex-col max-w-4xl mx-auto">
                    <div class="bg-slate-50/50 border-b border-slate-100 px-8 py-4 hidden md:grid grid-cols-[1fr_1fr_140px] gap-4 items-center uppercase tracking-[0.2em] text-[10px] font-black text-slate-400">
                        <div>Bill Details</div>
                        <div>Customer Info</div>
                        <div class="text-right">Balance Due</div>
                    </div>

                    <div class="divide-y divide-slate-50">
                        ${list.length === 0 ? `<div class="py-24 text-center text-slate-300 font-bold italic">No pending dues found.</div>` :
                            list.map(s => `
                                <div onclick="window.openReceipt('${s.id}')" class="px-8 py-5 grid grid-cols-2 md:grid-cols-[1fr_1fr_140px] gap-x-4 gap-y-2 items-center hover:bg-slate-50/50 cursor-pointer transition-colors group">
                                    <div>
                                        <p class="text-base font-black text-slate-800 leading-tight group-hover:text-rose-600 transition-colors">${s.billNo}</p>
                                        <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">${new Date(s.date).toLocaleDateString()}</p>
                                    </div>
                                    <div>
                                        <p class="text-sm font-black text-slate-700 capitalize">${s.customerName || 'Client'}</p>
                                        <p class="text-[10px] font-bold text-slate-400">${s.customerPhone}</p>
                                    </div>
                                    <div class="text-right text-lg font-black text-rose-600 tracking-tighter">${fmt(s.balanceDue)}</div>
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


        // DASHBOARD MENU
        if (section === 'menu') {
            const menuItems = [
                { id: 'printer', label: 'Printer Setup', icon: 'printer', color: 'indigo', sub: 'Width & Formatting' },
                { id: 'whatsapp', label: 'WA Templates', icon: 'message-square', color: 'emerald', sub: 'Message Content' },
                { id: 'tax', label: 'Tax Rules', icon: 'hash', color: 'violet', sub: 'GST & Local Taxes' },
                { id: 'discount', label: 'Discounts', icon: 'tag', color: 'rose', sub: 'Global Offers' }
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

        // PRINTER SECTION
        if (section === 'printer') {
            const printerWidth = window.erpState.printerWidth || '58';
            return `
            <div class="flex-1 overflow-y-auto p-10 bg-slate-50">
                <div class="max-w-2xl mx-auto bg-white p-10 rounded-[48px] shadow-sm animate-pop-in">
                    <h3 class="text-sm font-black text-slate-400 uppercase tracking-[0.2em] mb-8 text-center">Paper Width Configuration</h3>
                    <div class="grid grid-cols-2 gap-6">
                        <button onclick="window.updatePrinterWidth('58')" class="p-8 rounded-[36px] border-2 transition-all flex flex-col items-center ${printerWidth === '58' ? 'border-violet-600 bg-violet-50' : 'border-slate-50 bg-slate-50 text-slate-400 shadow-inner'}">
                            <p class="font-black text-3xl mb-2">58<span class="text-xs uppercase ml-1">mm</span></p>
                            <p class="text-[9px] uppercase font-black tracking-widest">Standard POS</p>
                        </button>
                        <button onclick="window.updatePrinterWidth('80')" class="p-8 rounded-[36px] border-2 transition-all flex flex-col items-center ${printerWidth === '80' ? 'border-violet-600 bg-violet-50' : 'border-slate-50 bg-slate-50 text-slate-400 shadow-inner'}">
                            <p class="font-black text-3xl mb-2">80<span class="text-xs uppercase ml-1">mm</span></p>
                            <p class="text-[9px] uppercase font-black tracking-widest">Desktop Thermal</p>
                        </button>
                    </div>
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
                            ${['customerName', 'billNo', 'totalCost', 'advancePaid', 'balance', 'deliveryDate'].map(t => `
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
    }

    // --- Settings Logics ---
    window.updatePrinterWidth = async (w) => {
        window.erpState.printerWidth = w;
        window.renderApp();
        try {
            await window.FB.collection('settings').doc('general').set({ printerWidth: w }, { merge: true });
        } catch(e) { console.error(e); }
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
        let discount = window.erpState.activeDiscountAmt || 0;
        let activeTax = window.erpState.activeTax || 0;

        const calcTotal = () => {
            const taxVal = (window.erpState.taxes[activeTax] || {val:0}).val;
            return subtotal - discount + ((subtotal - discount) * taxVal / 100);
        };

        const modal = document.createElement('div');
        modal.id = 'charge-modal-overlay';
        modal.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-[500] p-4";
        modal.innerHTML = `
            <div class="bg-white w-full max-w-md rounded-[48px] p-8 shadow-2xl animate-pop-in border border-slate-100 relative overflow-hidden">
                <div class="absolute -right-12 -top-12 w-48 h-48 bg-violet-50 rounded-full blur-3xl pointer-events-none opacity-60"></div>
                
                <div class="flex items-center justify-between mb-6 pb-4 border-b border-slate-50 relative">
                    <div>
                        <p class="text-[9px] font-black text-violet-600 uppercase tracking-[0.2em] mb-1">Billing Terminal</p>
                        <h2 class="text-2xl font-black text-slate-800 tracking-tighter uppercase">Checkout</h2>
                    </div>
                    <button onclick="document.getElementById('charge-modal-overlay').remove()" class="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl hover:bg-rose-50 hover:text-rose-500 flex items-center justify-center transition-all group">
                         <i data-lucide="x" class="w-4 h-4"></i>
                    </button>
                </div>

                <div class="space-y-5 mb-8 relative">
                    <div class="space-y-1.5">
                        <input id="cm_client_phone" oninput="window.lookupClient(this.value)" type="tel" placeholder="Phone Number" class="w-full px-5 py-3.5 bg-slate-50 border-none rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-violet-500/10 shadow-inner">
                        <input id="cm_client_name" type="text" placeholder="Customer Name" class="w-full px-5 py-3.5 bg-slate-50 border-none rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-violet-500/10 shadow-inner">
                    </div>

                    <div class="bg-slate-50 p-5 rounded-[32px] border border-slate-100">
                        <div class="flex justify-between items-center mb-4">
                            <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Subtotal</span>
                            <span class="font-black text-slate-600">${fmt(subtotal)}</span>
                        </div>

                        <div class="space-y-4">
                            <div>
                                <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Discount Rule</label>
                                <select id="cm_discount_select" onchange="window.handleDiscountChange(this.value, ${subtotal})" class="w-full px-4 py-3 bg-white border border-slate-100 rounded-xl font-bold text-xs outline-none focus:ring-2 focus:ring-violet-500/20">
                                    <option value="">No Discount</option>
                                    ${window.erpState.discounts.map(d => `<option value="${d.label}" ${window.erpState.activeDiscountLabel === d.label ? 'selected' : ''}>${d.label} (${d.type === 'pct' ? d.val + '%' : '₹' + d.val})</option>`).join('')}
                                </select>
                            </div>

                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Advance Paid ₹</label>
                                    <input id="cm_advance" type="number" placeholder="0" class="w-full px-4 py-3 bg-white border border-slate-100 rounded-xl font-black text-emerald-600 text-lg outline-none focus:ring-2 focus:ring-emerald-500/20">
                                </div>
                                <div>
                                    <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Method</label>
                                    <select id="cm_payment_method" class="w-full px-4 py-3 bg-white border border-slate-100 rounded-xl font-bold text-xs outline-none">
                                        <option value="Cash">Cash</option>
                                        <option value="Digital (UPI)">UPI / Digital</option>
                                        <option value="Card Linked">Card Payment</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="bg-slate-900 p-6 rounded-[32px] shadow-xl relative overflow-hidden">
                        <div class="flex justify-between items-center relative z-10">
                            <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Final Total</span>
                            <span id="cm_final" class="text-3xl font-black text-white">${fmt(calcTotal())}</span>
                        </div>
                    </div>
                </div>

                <button onclick="window._completeCheckout()" class="w-full py-5 bg-violet-600 text-white rounded-[28px] font-black uppercase tracking-[0.2em] text-[10px] shadow-2xl shadow-violet-200 hover:bg-slate-900 transition-all active:scale-95 flex items-center justify-center gap-3">
                    <i data-lucide="shield-check" class="w-4 h-4"></i> Confirm Transaction
                </button>
            </div>
        `;
        document.body.appendChild(modal);
        lucide.createIcons();
        document.getElementById('cm_client_phone').focus();

        // Attach helper functions to window if not present
        window.handleDiscountChange = (label, sub) => {
            const d = window.erpState.discounts.find(x => x.label === label);
            if (!d) {
                window.erpState.activeDiscountAmt = 0;
                window.erpState.activeDiscountLabel = "";
            } else {
                window.erpState.activeDiscountLabel = label;
                window.erpState.activeDiscountAmt = d.type === 'pct' ? (sub * d.val / 100) : d.val;
            }
            document.getElementById('cm_final').innerText = fmt(sub - (window.erpState.activeDiscountAmt || 0));
        };
    };

    window._completeCheckout = async () => {
        const phone = document.getElementById('cm_client_phone').value.trim();
        const name = document.getElementById('cm_client_name').value.trim();
        const advance = parseFloat(document.getElementById('cm_advance').value || 0);
        const method = document.getElementById('cm_payment_method') ? document.getElementById('cm_payment_method').value : document.getElementById('cm_method').value;
        const discountAmt = window.erpState.activeDiscountAmt || 0;

        if(!phone || phone.length < 10) return alert("Valid phone number required");
        if(!name) return alert("Customer name required");

        const btn = document.querySelector("#charge-modal-overlay button.bg-violet-600") || document.querySelector("button[onclick='window._completeCheckout()']");
        const origText = btn.innerHTML;
        btn.innerHTML = `<i class="w-5 h-5 animate-spin border-2 border-white/20 border-t-white rounded-full"></i> SYNCING...`;
        btn.disabled = true;

        try {
            const subtotal = window.erpState.cart.reduce((a, b) => a + (b.price * b.qty), 0);
            const total = subtotal - discountAmt;
            const counter = (window.erpState.counter || 2499) + 1;
            const billNo = "INV-" + counter;

            // Business Logic from POSv1: 0 advance or full advance means Paid In Full
            const balanceDue = (advance === 0 || advance >= total) ? 0 : total - advance;
            const finalPaid = (advance === 0 || advance >= total) ? total : advance;

            const saleData = {
                billNo,
                customerName: name,
                customerPhone: phone,
                date: Date.now(),
                timestamp: Date.now(),
                items: JSON.parse(JSON.stringify(window.erpState.cart)),
                subtotal, 
                discount: discountAmt,
                total, 
                advancePaid: finalPaid,
                balanceDue: balanceDue,
                paymentMode: method,
                counter
            };

            await DATA_PATH('sales').add(saleData);
            
            if(!window.erpState.clients.find(c => c.phone === phone)){
                await window.FB.collection('clients').add({ name, phone, createdAt: Date.now() });
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
        const sale = window.erpState.sales.find(s => s.id === id);
        if (!sale) return;

        // Unified Mapping with 0-safe checks
        const subtotal = sale.subtotal || 0;
        const discount = sale.discount || 0;
        const total = sale.total || (subtotal - discount);
        const balance = sale.balanceDue || 0;

        const tailoringRefs = [...new Set((sale.items || []).map(i => i.tailoringRef || i.tailoringBillNo).filter(Boolean))];
        const tailoringHtml = tailoringRefs.length > 0 ? `
            <div class="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl mb-4">
                <p class="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1">Tailoring Reference</p>
                <p class="font-black text-indigo-600">${tailoringRefs.join(', ')}</p>
            </div>
        ` : '';

        const modal = document.createElement("div");
        modal.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[500] p-4";
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

        modal.innerHTML = `
            <div class="bg-white w-full max-w-sm rounded-[40px] shadow-2xl animate-pop-in border border-slate-100 overflow-hidden my-auto relative">
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
        const width = window.erpState.printerWidth || '58';
        const widthPx = width === '80' ? '80mm' : '58mm';

        const dateObj = new Date(sale.date);
        const dateStr = dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        const timeStr = dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

        const w = window.open('', '_blank', `width=${width === '80' ? 450 : 350},height=600`);
        
        let html = `<html><body style='font-family:monospace;width:${widthPx};font-size:10px;margin:0;padding:5px;line-height:1.2;color:#000;'>`;

        html += "<div style='text-align:center;font-weight:bold;font-size:16px;letter-spacing:1px;'>LAVISH LAVENDER</div>";
        html += "<div style='text-align:center;font-size:9px;'>Bridal & Fashion Boutique</div>";
        html += "<div style='text-align:center;font-size:9px;'>Uppala, Kasaragod, Kerala</div>";
        html += "<div style='text-align:center;font-size:9px;'>+91 75580 08881 | lavishlavender.in</div>";
        html += "<hr style='border:none;border-top:1px dashed #000;margin:5px 0;'>";

        html += "<div>Bill No: " + billNo + "</div>";
        html += "<div>Date: " + dateStr + " Time: " + timeStr + "</div>";
        html += "<div>Customer: " + (sale.customerName || 'Walk-in') + "</div>";
        html += "<div>Phone: " + (sale.customerPhone || 'N/A') + "</div>";

        const tRefs = [...new Set(items.map(i => i.tailoringRef || i.tailoringBillNo).filter(Boolean))];
        if (tRefs.length > 0) {
            html += "<div style='font-weight:bold;margin-top:2px;'>Tailoring Ref: " + tRefs.join(', ') + "</div>";
        }

        html += "<hr style='border:none;border-top:1px dashed #000;margin:5px 0;'>";

        html += "<table style='width:100%;font-size:10px;text-align:left;'>";
        html += "<tr style='font-weight:bold;'><td>Item</td><td style='text-align:center;'>Qty</td><td style='text-align:right;'>Amt</td></tr>";
        html += "<tr><td colspan='3' style='border-top:1px dashed #000;'></td></tr>";

        items.forEach(i => {
            html += "<tr>";
            html += "<td style='padding:2px 0;'>" + i.name + "</td>";
            html += "<td style='text-align:center;'>x" + i.qty + "</td>";
            html += "<td style='text-align:right;'>₹" + (i.price * i.qty).toLocaleString('en-IN') + "</td>";
            html += "</tr>";
        });
        html += "</table>";
        html += "<hr style='border:none;border-top:1px dashed #000;margin:5px 0;'>";

        const subtotal = sale.subtotal || 0;
        const discount = sale.discount || 0;
        const total = sale.total || 0;
        const paid = sale.advancePaid || 0;
        const balance = sale.balanceDue || 0;

        const printRow = (l, v, b = false, c = '#000') =>
            `<div style="display:flex;justify-content:space-between;${b ? 'font-weight:bold;' : ''}color:${c};"><span>${l}</span><span>${v}</span></div>`;

        html += printRow("Subtotal", "₹" + subtotal.toLocaleString('en-IN'));
        if (discount > 0) html += printRow("Discount", "- ₹" + discount.toLocaleString('en-IN'));
        html += "<hr style='border:none;border-top:1px dashed #000;margin:3px 0;'>";
        html += printRow("TOTAL", "₹" + total.toLocaleString('en-IN'), true);
        html += printRow("Paid", "₹" + paid.toLocaleString('en-IN'));
        if (balance > 0) html += printRow("Balance Due", "₹" + balance.toLocaleString('en-IN'), true, "#dc2626");

        html += "<hr style='border:none;border-top:1px dashed #000;margin:5px 0;'>";
        html += "<div style='text-align:center;font-size:9px;font-weight:bold;margin-top:5px;'>*** IMPORTANT CARE NOTES ***</div>";
        html += "<div style='text-align:center;font-size:9px;'>No Returns | No Exchange</div>";
        html += "<div style='text-align:center;font-size:9px;'>Dry Wash Only</div>";
        html += "<hr style='border:none;border-top:1px dashed #000;margin:8px 0;'>";
        html += "<div style='text-align:center;font-size:9px;'>Thank you for visiting Lavish Lavender!</div>";
        html += "<div style='text-align:center;font-size:10px;font-weight:bold;margin-top:5px;'>lavishlavender.in</div>";
        html += "<div style='height:30px;'></div>";
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
        }
    };

    window.shareWhatsApp = (billNo, name, phone, total, balance = 0) => {
        const sale = window.erpState.sales.find(s => s.billNo === billNo);
        const data = {
            customerName: name || 'Customer',
            billNo: billNo,
            totalCost: (total || 0).toLocaleString('en-IN'),
            advancePaid: (total - balance).toLocaleString('en-IN'),
            balance: (balance || 0).toLocaleString('en-IN'),
            deliveryDate: sale ? new Date(sale.date).toLocaleDateString() : 'N/A'
        };

        const templates = window.erpState.whatsappTemplates || {};
        let tpl = balance > 0 ? (templates.ready || templates.booking) : templates.delivered;
        
        if (!tpl) {
            tpl = `Hi {customerName},\n\nThank you for shopping at *Lavish Lavender*!\n\nYour bill *{billNo}* for *₹{totalCost}* is paid. {balance != "0" ? 'Remaining balance: *₹{balance}*' : ''}\n\nView details: https://www.lavishlavender.in/receipt/?bill={billNo}`;
        }

        const msg = encodeURIComponent(fillTemplate(tpl, data));
        const cleanPhone = (phone || "").toString().replace(/\D/g, '');
        const target = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;
        if (target) window.open(`https://wa.me/${target}?text=${msg}`, '_blank');
    };

    window.sendReminder = (billNo, name, phone, balance) => {
        const data = {
            customerName: name || 'Customer',
            billNo: billNo,
            balance: (balance || 0).toLocaleString('en-IN')
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
                whatsappTemplates: window.erpState.whatsappTemplates || null,
                taxes: window.erpState.taxes,
                discounts: window.erpState.discounts,
                menuOrder: (window.erpState.menuItems || []).map(i => i.id),
                updatedAt: Date.now()
            }, { merge: true });
        } catch (e) {
            console.error("Failed to save settings:", e);
        }
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

                <div class="grid grid-cols-2 gap-8 mb-12 relative">
                    <div class="p-6 bg-slate-50 rounded-[32px] border border-slate-100">
                        <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Member Since</p>
                        <p class="font-black text-slate-800 uppercase tracking-tight">${new Date(c.createdAt || Date.now()).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</p>
                    </div>
                    <div class="p-6 bg-slate-50 rounded-[32px] border border-slate-100">
                        <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Account Logic</p>
                        <p class="font-black text-emerald-600 uppercase tracking-tight">Active Partner</p>
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
        modal.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-start md:items-center overflow-y-auto p-4 py-8 md:py-4 z-[600]";
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
        modal.innerHTML = `
            <div class="bg-white w-full max-w-sm rounded-[40px] p-8 shadow-2xl animate-pop-in relative my-auto">
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

    window.openStitchingModal = (it) => {
        var modal = document.createElement("div");
        modal.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-start md:items-center overflow-y-auto p-4 py-8 md:py-4 z-[600]";
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

        const today = new Date();
        const delivery = new Date(today);
        delivery.setDate(today.getDate() + 10);
        const deliveryStr = delivery.toISOString().split('T')[0];

        modal.innerHTML = `
            <div class="bg-white rounded-[40px] p-8 w-full max-w-sm animate-pop-in shadow-2xl my-auto relative">
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
                const nums = (window.erpState.orders || []).map(d => parseInt(d.billNo?.replace(/\\D/g, '') || 0)).filter(n => n > 0);
                const cartNums = window.erpState.cart.map(c => parseInt(c.tailoringRef?.replace(/\\D/g, '') || 0)).filter(n => n > 0);
                const next = Math.max(100, ...nums, ...cartNums) + 1;
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
                        notesLog: [{ text: "Pre-linked via POS Terminal", timestamp: new Date().toLocaleString() }]
                    });
                }

                let ex = window.erpState.cart.find(x => x.sku === it.sku && x.tailoringRef === billNo);
                if (ex) {
                    ex.qty += 1; ex.price = sPrice;
                } else {
                    window.erpState.cart.push({
                        sku: it.sku, id: it.id, name: it.name + " (" + billNo + ")", price: sPrice, cost: it.costPrice, qty: 1,
                        tailoringRef: billNo, deliveryDate: dDate
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
})();
