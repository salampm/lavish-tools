// Tailoring Module Logic
window.APP_VERSION = "v2.4.1";
(function() {
    // Re-bind helpers for convenience
    const fmt = window.fmt || ((v) => '₹' + (v || 0).toLocaleString('en-IN'));
    const db = window.FB?.db;
    
    // Firestore Path Helpers (Unified with POS & Live database)
    const ORDERS_COL = () => window.FB.root('orders');
    const CLIENTS_COL = () => window.FB.root('clients');

    // ISSUE #6 FIX: Use sanitizePhone for client lookup in WhatsApp
    window.sendWA = (id, type) => {
        const o = window.erpState.orders.find(x => x.id === id);
        if (!o) return;

        const client = (window.erpState.clients || []).find(c => window.sanitizePhone(c.phone) === window.sanitizePhone(o.phone));
        const earned = o.loyaltySnapshot?.earned || 0;
        const totalPts = client?.loyaltyPoints || 0;
        const tier = (client?.tier || o.loyaltySnapshot?.tier || 'Basic').toUpperCase();

        const target = window.sanitizePhone(o.phone);
        const templates = window.erpState.whatsappTemplates || {};
        const bal = Math.max(0, (o.totalCost || 0) - (o.deliveryDiscount || 0) - (o.advancePaid || 0));
        
        let template = "";
        if (type === 1) template = templates.booking;
        else if (type === 2) template = templates.ready;
        else if (type === 3) template = templates.delivered;
        else if (type === 4) template = templates.reminder;

        if (!template) {
            const footer = `\n\n✨ *Loyalty Status*\n${earned} PT Erned | ${totalPts} Total PT | ${tier} Tier`;
            if (type === 1) template = "Hi {customerName}, your order {billNo} is confirmed. Total: ₹{totalCost}, Advance: ₹{advancePaid}. Expected Delivery: {deliveryDate}." + footer;
            else if (type === 2) template = "Hi {customerName}, your order {billNo} is ready! Balance: ₹{balance}. Visit us soon." + footer;
            else if (type === 3) template = "Hi {customerName}, your order {billNo} is delivered! Hope you love it." + footer + "\nReceipt: https://lavishlavender.in/receipt/?bill={billNo}";
            else if (type === 4) template = "Hi {customerName}, friendly reminder for order {billNo}. Balance: ₹{balance}." + footer;
        }

        const msgText = template
            .replace(/{customerName}/g, o.customerName)
            .replace(/{billNo}/g, o.billNo)
            .replace(/{totalCost}/g, o.totalCost)
            .replace(/{advancePaid}/g, o.advancePaid || 0)
            .replace(/{balance}/g, bal)
            .replace(/{earnedPoints}/g, earned)
            .replace(/{pointsEarned}/g, earned)
            .replace(/{totalPoints}/g, totalPts)
            .replace(/{points}/g, totalPts)
            .replace(/{tier}/g, tier)
            .replace(/{deliveryDate}/g, window.fmtDate(o.deliveryDate));

        window.open(`https://wa.me/${target.length === 10 ? '91' + target : target}?text=${encodeURIComponent(msgText)}`, '_blank');
    };

    window.showPopup = (label, action) => {
        const c = document.getElementById('toast-container');
        if (!c) return;
        c.innerHTML = `
            <div class="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white p-6 rounded-[32px] shadow-2xl border border-slate-700 z-[1000] animate-pop-in w-[90%] max-w-[400px]">
                <div class="flex items-center gap-4 mb-5">
                    <div class="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/20">
                        <i data-lucide="check" class="w-6 h-6 text-white"></i>
                    </div>
                    <div>
                        <p class="text-[11px] font-black uppercase text-emerald-400 tracking-widest">Action Ready</p>
                        <p class="text-sm font-medium mt-0.5">${label}</p>
                    </div>
                </div>
                <div class="flex gap-3">
                    <button id="wa-action-btn" class="flex-1 bg-emerald-500 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest btn-press">Send WhatsApp Now</button>
                    <button onclick="document.getElementById('toast-container').classList.add('hidden')" class="px-4 py-4 bg-slate-800 text-slate-400 rounded-2xl font-black uppercase text-[10px]">Skip</button>
                </div>
            </div>`;
        document.getElementById('wa-action-btn').onclick = () => { action(); document.getElementById('toast-container').classList.add('hidden'); };
        c.classList.remove('hidden');
        lucide.createIcons();
    };

    // --- VIEW RENDERER ---
    window.renderTailoringView = function(tab) {
        const orders = window.erpState.orders || [];

        switch(tab) {
            case 'tracker':     return renderTracker(orders);
            case 'ready':       return renderReady(orders);
            case 'pending-due': return renderPendingDue(orders);
            case 'history':     return renderHistory(orders);
            default:            return renderTracker(orders);
        }
    };

    function renderOrderStrip(o, color) {
        const bal = (o.totalCost || 0) - (o.advancePaid || 0);
        return `
        <div onclick="window.openOrderDetails('${o.id}')" class="bg-white p-4 rounded-2xl border-l-4 border-${color}-500 shadow-sm flex items-center justify-between cursor-pointer active:scale-95 transition-all">
            <div class="min-w-0">
                <div class="flex items-center gap-2">
                    <h4 class="font-black text-slate-800 text-sm truncate uppercase">${o.customerName}</h4>
                    <span class="text-[9px] font-black text-violet-400 font-mono">${o.billNo}</span>
                </div>
                <p class="text-[10px] font-bold text-slate-400 mt-0.5">Placed: ${window.fmtDate(o.orderDate || o.timestamp)} • Due: ${window.fmtDate(o.deliveryDate)}</p>
            </div>
            <div class="text-right">
                <p class="text-[10px] font-black ${bal > 0 ? 'text-rose-500' : 'text-emerald-500'} uppercase">${bal > 0 ? '₹'+bal+' Due' : 'Paid'}</p>
                <p class="text-[9px] font-black text-slate-400 uppercase mt-1 tracking-widest">${o.status}</p>
            </div>
        </div>
        `;
    }

    // --- TRACKER VIEW ---
    window.toggleTrackerSort = function(key) {
        if (window.erpState.trackerSortKey === key) {
            window.erpState.trackerSortDir = window.erpState.trackerSortDir === 'desc' ? 'asc' : 'desc';
        } else {
            window.erpState.trackerSortKey = key;
            window.erpState.trackerSortDir = 'desc';
        }
        window.renderApp();
    };

    function renderTrackerListContent(orders) {
        const key = window.erpState.trackerSortKey || 'deliveryDate';
        const dir = window.erpState.trackerSortDir || 'desc';

        const active = orders.filter(o => o.status !== 'Delivered' && o.status !== 'Ready').sort((a,b) => {
            let valA = a[key] || '';
            let valB = b[key] || '';
            if (key === 'billNo') {
                valA = parseInt(valA.replace(/\D/g,'')) || 0;
                valB = parseInt(valB.replace(/\D/g,'')) || 0;
            }
            if (dir === 'desc') return valB < valA ? -1 : 1;
            return valA < valB ? -1 : 1;
        });

        return active.map(o => renderOrderCard(o)).join('') || `<div class="col-span-full py-40 text-center text-slate-300 italic flex flex-col items-center justify-center opacity-40"><i data-lucide="scissors" class="w-16 h-16 mb-4"></i> No production items found</div>`;
    }

    function renderTracker(orders) {
        return `
        <div class="p-8 h-full flex flex-col overflow-hidden bg-slate-50/50">
            <div class="mb-10 flex flex-col md:flex-row gap-6">
                <div class="relative flex-1">
                    <i data-lucide="search" class="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5"></i>
                    <input type="text" id="tracker-search" placeholder="Search production queue..." class="w-full pl-14 pr-6 py-4 bg-white border border-slate-100 rounded-[28px] text-sm font-bold shadow-sm outline-none focus:border-violet-200 transition-all" oninput="window.filterTracker(this.value)">
                </div>
                <div class="flex gap-3">
                    <button onclick="window.toggleTrackerSort('billNo')" class="bg-white border border-slate-100 px-6 py-4 rounded-[24px] text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-sm ${window.erpState.trackerSortKey === 'billNo' ? 'text-violet-600 border-violet-200 bg-violet-50' : 'text-slate-400'}">
                        <i data-lucide="hash" class="w-4 h-4"></i> Bill ${window.erpState.trackerSortKey === 'billNo' ? (window.erpState.trackerSortDir === 'desc' ? '↓' : '↑') : ''}
                    </button>
                    <button onclick="window.toggleTrackerSort('deliveryDate')" class="bg-white border border-slate-100 px-6 py-4 rounded-[24px] text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-sm ${window.erpState.trackerSortKey === 'deliveryDate' ? 'text-violet-600 border-violet-200 bg-violet-50' : 'text-slate-400'}">
                        <i data-lucide="calendar" class="w-4 h-4"></i> Date ${window.erpState.trackerSortKey === 'deliveryDate' ? (window.erpState.trackerSortDir === 'desc' ? '↓' : '↑') : ''}
                    </button>
                </div>
            </div>
            <div id="tracker-list" class="flex-1 overflow-y-auto grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4 md:gap-10 custom-scrollbar pr-2 md:pr-4 pb-20">
                ${renderTrackerListContent(orders)}
            </div>
        </div>
        `;
    }

    function renderReadyListContent(orders) {
        const key = window.erpState.trackerSortKey || 'deliveryDate';
        const dir = window.erpState.trackerSortDir || 'desc';

        const list = orders.filter(o => {
            const bal = (o.totalCost || 0) - (o.advancePaid || 0) - (o.deliveryDiscount || 0);
            return o.status === 'Ready' && bal > 0;
        }).sort((a,b) => {
            let valA = a[key] || '';
            let valB = b[key] || '';
            if (key === 'billNo') {
                valA = parseInt(valA.replace(/\D/g,'')) || 0;
                valB = parseInt(valB.replace(/\D/g,'')) || 0;
            }
            if (dir === 'desc') return valB < valA ? -1 : 1;
            return valA < valB ? -1 : 1;
        });

        return list.map(o => renderOrderCard(o)).join('') || `<div class="col-span-full py-40 text-center text-slate-300 italic flex flex-col items-center justify-center opacity-40"><i data-lucide="package-check" class="w-16 h-16 mb-4"></i> All ready orders picked up</div>`;
    }

    function renderReady(orders) {
        return `
        <div class="p-8 h-full flex flex-col overflow-hidden bg-slate-50/50">
            <div class="mb-10 flex flex-col md:flex-row gap-6">
                <div class="relative flex-1">
                    <i data-lucide="search" class="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5"></i>
                    <input type="text" id="tracker-search" placeholder="Search ready orders..." class="w-full pl-14 pr-6 py-4 bg-white border border-slate-100 rounded-[28px] text-sm font-bold shadow-sm outline-none focus:border-violet-200 transition-all" oninput="window.filterTracker(this.value)">
                </div>
                <div class="flex gap-3">
                    <button onclick="window.toggleTrackerSort('billNo')" class="bg-white border border-slate-100 px-6 py-4 rounded-[24px] text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-sm ${window.erpState.trackerSortKey === 'billNo' ? 'text-violet-600 border-violet-200 bg-violet-50' : 'text-slate-400'}">
                        <i data-lucide="hash" class="w-4 h-4"></i> Bill ${window.erpState.trackerSortKey === 'billNo' ? (window.erpState.trackerSortDir === 'desc' ? '↓' : '↑') : ''}
                    </button>
                    <button onclick="window.toggleTrackerSort('deliveryDate')" class="bg-white border border-slate-100 px-6 py-4 rounded-[24px] text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-sm ${window.erpState.trackerSortKey === 'deliveryDate' ? 'text-violet-600 border-violet-200 bg-violet-50' : 'text-slate-400'}">
                        <i data-lucide="calendar" class="w-4 h-4"></i> Date ${window.erpState.trackerSortKey === 'deliveryDate' ? (window.erpState.trackerSortDir === 'desc' ? '↓' : '↑') : ''}
                    </button>
                </div>
            </div>
            <div id="tracker-list" class="flex-1 overflow-y-auto grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4 md:gap-10 custom-scrollbar pr-2 md:pr-4 pb-20">
                ${renderReadyListContent(orders)}
            </div>
        </div>
        `;
    }


    function renderOrderCard(o) {
        // ISSUE #3 FIX: Include delivery discount in balance calculation
        const rawBal = (o.totalCost || 0) - (o.advancePaid || 0) - (o.deliveryDiscount || 0);
        const bal = Math.max(0, rawBal);
        const statusColors = {
            'Pending': 'bg-slate-100 text-slate-600',
            'Order Confirmed': 'bg-violet-50 text-violet-600 border border-violet-100',
            'Stitching': 'bg-amber-50 text-amber-600 border border-amber-100',
            'Ready': 'bg-emerald-50 text-emerald-600 border border-emerald-100',
            'Delivered': 'bg-slate-900 text-white'
        };

        const isOverdue = o.deliveryDate && new Date(o.deliveryDate) < new Date() && o.status !== 'Delivered';

        return `
        <div id="card-${o.id}" onclick="window.openOrderDetails('${o.id}')" class="bg-white p-4 md:p-6 rounded-[24px] md:rounded-[32px] border border-slate-100 shadow-sm flex flex-col h-fit hover:shadow-xl transition-all cursor-pointer group">
            <div class="flex justify-between items-start mb-3 md:mb-4">
                <div>
                   <h3 class="font-black text-xs md:text-lg uppercase text-slate-900 leading-tight line-clamp-1">${o.customerName}</h3>
                   <span class="text-[8px] md:text-[10px] font-black text-violet-400 font-mono tracking-tighter uppercase block mt-0.5">№ ${o.billNo}</span>
                </div>
                <span class="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">${window.fmtDate(o.deliveryDate)}</span>
            </div>

            <div class="space-y-1 mb-4 md:mb-6">
                ${(o.items || []).slice(0, 2).map(it => `
                    <div class="flex justify-between text-[10px] md:text-xs font-bold text-slate-500">
                        <span class="truncate pr-2">${it.qty || 1}x ${it.name}</span>
                        <span class="shrink-0 flex items-center">${isOverdue ? '<i data-lucide="alert-circle" class="w-2.5 h-2.5 text-rose-500 inline mr-0.5"></i>' : ''} ${window.fmtDate(o.orderDate || o.timestamp)}</span>
                    </div>
                `).join('')}
                ${(o.items || []).length > 2 ? `<div class="text-[8px] font-black text-violet-400 uppercase tracking-widest">+ ${(o.items.length - 2)} more items</div>` : ''}
                ${(o.items || []).length === 0 ? '<div class="text-xs italic text-slate-300">No items</div>' : ''}
            </div>

            <div class="flex items-center justify-between pt-3 md:pt-4 border-t border-slate-50">
                <div class="flex flex-col">
                    <span class="text-sm md:text-xl font-black ${bal > 0 ? 'text-rose-600' : 'text-slate-900'}">₹${bal.toLocaleString()}</span>
                </div>
                <div class="flex gap-2">
                    <span class="px-2 md:px-5 py-1.5 md:py-2.5 rounded-lg md:rounded-xl text-[7px] md:text-[10px] font-black uppercase tracking-widest ${statusColors[o.status] || statusColors['Pending']}">
                        ${o.status.replace('Order ', '').replace('Pickup', '')}
                    </span>
                </div>
            </div>
        </div>
        `;
    }

    // --- PENDING DUE VIEW ---
    function renderPendingDue(orders) {
        const now = new Date();
        const dues = orders
            .map(o => {
                const bal = Math.max(0, (o.totalCost || 0) - (o.advancePaid || 0) - (o.deliveryDiscount || 0));
                return { ...o, bal };
            })
            .filter(o => o.bal > 0)
            .sort((a, b) => b.bal - a.bal);

        const totalDue = dues.reduce((sum, o) => sum + o.bal, 0);

        return `
        <div class="flex flex-col h-full bg-slate-50">
            <!-- Header -->
            <div class="sticky top-0 z-10 bg-white/80 backdrop-blur-md p-6 border-b border-slate-200">
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 max-w-4xl mx-auto">
                    <div>
                        <h2 class="text-2xl font-black text-slate-800 tracking-tighter uppercase">Pending Collection</h2>
                        <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">${dues.length} orders with outstanding balance</p>
                    </div>
                    <div class="bg-rose-600 px-8 py-4 rounded-[24px] text-white shadow-xl shadow-rose-100 text-right flex-shrink-0">
                        <p class="text-[9px] font-black uppercase tracking-widest opacity-70">Total Receivable</p>
                        <p class="text-2xl font-black leading-tight">${fmt(totalDue)}</p>
                    </div>
                </div>
            </div>

            <!-- List -->
            <div class="flex-1 overflow-y-auto p-6 custom-scrollbar">
                <div id="pending-due-list" class="max-w-4xl mx-auto space-y-3">
                    ${renderPendingDueListContent(orders)}
                </div>
            </div>
        </div>`;
    }

    function renderPendingDueListContent(orders) {
        const now = new Date();
        const dues = orders
            .map(o => {
                const bal = Math.max(0, (o.totalCost || 0) - (o.advancePaid || 0) - (o.deliveryDiscount || 0));
                return { ...o, bal };
            })
            .filter(o => o.bal > 0)
            .sort((a, b) => b.bal - a.bal);

        return dues.map(o => {
            const isOverdue = o.deliveryDate && new Date(o.deliveryDate) < now;
            const isUrgent = o.deliveryDate && !isOverdue && (new Date(o.deliveryDate) - now) < (48 * 60 * 60 * 1000);
            const badgeColor = o.status === 'Ready' ? 'bg-emerald-100 text-emerald-700' 
                             : o.status === 'Stitching' ? 'bg-blue-100 text-blue-700'
                             : 'bg-orange-100 text-orange-700';
            const borderColor = isOverdue ? 'border-l-rose-50-500' : isUrgent ? 'border-l-orange-400' : 'border-l-violet-300';

            return `
            <div onclick="window.openOrderDetails('${o.id}')" 
                 class="bg-white rounded-[24px] border border-slate-100 border-l-4 ${borderColor} shadow-sm p-6 flex items-center justify-between hover:shadow-lg transition-all cursor-pointer group">
                <div class="flex items-center gap-4 min-w-0">
                    <div class="w-11 h-11 rounded-2xl bg-rose-50 flex items-center justify-center font-black text-rose-500 text-base flex-shrink-0 group-hover:bg-rose-500 group-hover:text-white transition-colors">
                        ${o.customerName ? o.customerName[0].toUpperCase() : 'T'}
                    </div>
                    <div class="min-w-0">
                        <p class="font-black text-slate-800 text-sm uppercase leading-tight truncate">${window.esc(o.customerName || 'Unknown')}</p>
                        <div class="flex items-center gap-2 mt-1 flex-wrap">
                            <span class="text-[9px] font-black text-violet-400 font-mono">${window.esc(o.billNo)}</span>
                            <span class="text-slate-200">•</span>
                            <span class="text-[9px] font-bold text-slate-400 font-mono">Placed: ${window.fmtDate(o.orderDate || o.timestamp)}</span>
                            <span class="text-slate-200">•</span>
                            <span class="text-[9px] font-bold text-slate-400">Due: ${window.fmtDate(o.deliveryDate)}</span>
                            <span class="px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${badgeColor}">${window.esc(o.status === 'Order Confirmed' ? 'Confirmed' : o.status)}</span>
                            ${isOverdue ? `<span class="px-2 py-0.5 bg-rose-100 text-rose-600 rounded-full text-[8px] font-black uppercase">Overdue</span>` : ''}
                            ${isUrgent ? `<span class="px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full text-[8px] font-black uppercase">Urgent</span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-4 flex-shrink-0 ml-4">
                    <div class="text-right">
                        <p class="font-black text-rose-500 text-lg leading-none">${fmt(o.bal)}</p>
                        <p class="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Balance</p>
                    </div>
                    <button onclick="event.stopPropagation(); window.sendWA('${o.id}', 4)" class="p-3 bg-violet-600 text-white rounded-xl shadow-lg shadow-violet-200 hover:bg-violet-700 transition-colors">
                        <i data-lucide="bell" class="w-4 h-4 text-white"></i>
                    </button>
                </div>
            </div>`;
        }).join('') || `<div class="py-32 text-center text-slate-300 font-black uppercase text-xs tracking-widest">
                <p class="text-5xl mb-4">🎉</p>
                <p>All balances cleared!</p>
            </div>`;
    }

    window.updateTailoringList = function() {
        const orders = window.erpState.orders || [];
        const tab = window.currentTailorTab;
        
        const trackerList = document.getElementById('tracker-list');
        const pendingDueList = document.getElementById('pending-due-list');

        if (trackerList) {
            if (tab === 'tracker') {
                trackerList.innerHTML = renderTrackerListContent(orders);
            } else if (tab === 'ready') {
                trackerList.innerHTML = renderReadyListContent(orders);
            }
            
            // Re-apply filter if searching
            const searchInput = document.getElementById('tracker-search');
            if (searchInput && searchInput.value) {
                window.filterTracker(searchInput.value);
            }
        } else if (pendingDueList && tab === 'pending-due') {
            pendingDueList.innerHTML = renderPendingDueListContent(orders);
        }

        if (window.lucide) lucide.createIcons();
    };


    // --- HISTORY VIEW ---
    // M-01: Removed duplicate toggleHistorySort (moved to app.js)

    function renderHistory(orders) {
        window.erpState.historySort = window.erpState.historySort || 'desc';
        const delivered = orders.filter(o => {
            const bal = (o.totalCost || 0) - (o.advancePaid || 0) - (o.deliveryDiscount || 0);
            return o.status === 'Delivered' || (o.status === 'Ready' && bal <= 0);
        }).sort((a,b) => {
                const da = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp || 0);
                const db = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp || 0);
                return window.erpState.historySort === 'desc' ? db - da : da - db;
            });
        return `
        <div class="p-8 h-full flex flex-col overflow-hidden bg-slate-50">
            <div class="mb-8 flex justify-between items-center bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
                <div>
                    <h2 class="text-xl font-black text-slate-800 tracking-tight">Archives</h2>
                    <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Completed Tailoring Orders</p>
                </div>
                <div class="flex gap-3">
                    <button onclick="window.toggleHistorySort()" class="bg-indigo-50 text-indigo-600 px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-sm flex items-center gap-2 hover:bg-indigo-100 transition-colors">
                        <i data-lucide="arrow-up-down" class="w-4 h-4"></i> Sort ${window.erpState.historySort === 'desc' ? 'Newest' : 'Oldest'}
                    </button>
                    <button onclick="window.exportAll()" class="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl flex items-center gap-2">
                        <i data-lucide="download" class="w-4 h-4"></i> Backup CSV
                    </button>
                </div>
            </div>
            <div class="flex-1 bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden flex flex-col">
                <div class="overflow-x-auto">
                    <table class="w-full text-left text-xs whitespace-nowrap">
                        <thead class="bg-slate-50 border-b border-slate-200 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">
                            <tr>
                                <th class="p-6">Bill #</th>
                                <th class="p-6">Client Identity</th>
                                <th class="p-6">Placed On</th>
                                <th class="p-6">Garment Count</th>
                                <th class="p-6 text-right">Total Yield</th>
                                <th class="p-6 text-right pr-10">Delivered On</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            ${delivered.map(o => `
                                <tr onclick="window.openOrderDetails('${o.id}')" class="hover:bg-slate-50/50 transition-colors cursor-pointer group">
                                    <td class="p-6 border-l-4 border-transparent group-hover:border-violet-500 transition-colors"><span class="bg-violet-50 text-violet-600 px-3 py-1 rounded-lg font-black font-mono shadow-sm border border-violet-100">${window.esc(o.billNo)}</span></td>
                                    <td class="p-6">
                                        <p class="font-black text-slate-800 text-sm mb-0.5">${window.esc(o.customerName)}</p>
                                        <p class="text-[10px] text-slate-400 font-bold">${window.esc(o.phone)}</p>
                                    </td>
                                    <td class="p-6 font-bold text-slate-500">${window.fmtDate(o.orderDate || o.timestamp)}</td>
                                    <td class="p-6 text-slate-500 font-bold">${o.items?.length || 0} Items</td>
                                    <td class="p-6 text-right font-black text-slate-800 text-sm">${fmt(o.totalCost)}</td>
                                    <td class="p-6 text-right pr-10 font-black text-emerald-500">${window.fmtDate(o.actualDeliveryDate || o.deliveryDate)}</td>
                                </tr>
                            `).join('') || `<tr><td colspan="6" class="p-20 text-center text-slate-300 italic font-bold">No archives found</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        `;
    }

    window.exportToExcel = () => {
        const orders = window.erpState.orders || [];
        // ISSUE #23 FIX: Escape commas in all string fields to prevent CSV column corruption
        const esc = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
        const csv = [
            ['Bill No', 'Customer', 'Phone', 'Date', 'Total Cost', 'Advance', 'Balance', 'Status'],
            ...orders.map(o => [
                esc(o.billNo),
                esc(o.customerName),
                esc(o.phone),
                esc(o.orderDate || ''),
                o.totalCost,
                o.advancePaid || 0,
                Math.max(0, (o.totalCost||0) - (o.advancePaid||0) - (o.deliveryDiscount||0)),
                esc(o.status)
            ])
        ].map(r => r.join(',')).join('\n');
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Tailoring_Report_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    // --- ORDER HANDLING ---
    let draftMeasurements = null;
    let draftImages = [];

    window.openOrderModal = function() {
        // ISSUE #14 FIX: Always use absolute max to prevent bill number duplication
        const orders = window.erpState.orders || [];
        const absoluteMax = Math.max(99, ...orders.map(o => {
            const m = (o.billNo || "").match(/B-(\d+)/);
            return m ? parseInt(m[1]) : 0;
        }));
        document.getElementById('form-billNo').value = "B-" + (absoluteMax + 1);
        document.getElementById('form-orderDate').value = new Date().toISOString().split('T')[0];
        document.getElementById('items-container').innerHTML = '';
        document.getElementById('draft-measurement-status')?.classList.add('hidden');
        
        // L-10: Reset draft measurements to avoid state leaks from previous sessions
        window.draftMeasurements = null;
        window.selectedClientForDraft = null;
        window.addItem();
        document.getElementById('order-modal').classList.remove('hidden');
    };

    window.closeOrderModal = () => document.getElementById('order-modal').classList.add('hidden');

    window.addItem = function() {
        const c = document.getElementById('items-container');
        const div = document.createElement('div');
        div.className = 'grid grid-cols-[1fr_100px] gap-3 items-center';
        div.innerHTML = `
            <input type="text" placeholder="Garment Name (e.g. Kurti)" class="tailor-input garment-name" required>
            <input type="number" placeholder="Price ₹" class="tailor-input garment-price text-right" oninput="window.calcModalBal()" required>
        `;
        c.appendChild(div);
    };

    window.calcModalBal = function() {
        const prices = Array.from(document.querySelectorAll('.garment-price')).map(i => parseFloat(i.value) || 0);
        const total = prices.reduce((a,b) => a+b, 0);
        const adv = parseFloat(document.getElementById('advance-input').value) || 0;
        document.getElementById('modal-balance').innerText = "₹" + (total - adv);
    };

    // ISSUE #11 FIX: Use sanitizePhone for exact match after 10-digit input
    window.handlePhoneLookup = function(phone) {
        if (!phone) return;
        const clean = window.sanitizePhone(phone);
        if (clean.length < 5) return; // M-17: Progressive lookup improvement
        
        const client = (window.erpState.clients || []).find(c => {
            const p = window.sanitizePhone(c.phone);
            if (clean.length >= 10) return p === clean;
            return p.startsWith(clean);
        });
        if (client) {
            const nameEl = document.getElementById('form-cust-name');
            if (nameEl && !nameEl.value) {
                nameEl.value = client.name;
                const status = document.getElementById('phone-lookup-status');
                if (status) {
                    status.innerText = "Verified Client: " + client.name;
                    status.classList.remove('hidden');
                }
            }
        }
    };

    window.handleNameAutoFill = function(name) {
        if (!name) return;
        // L-22: Safe access for auto-fill logic
        const matches = (window.erpState.clients || []).filter(c => c.name?.toLowerCase().includes(name.toLowerCase()));
        if (matches.length > 0) {
            const phoneEl = document.getElementById('form-phone');
            if (phoneEl && !phoneEl.value) phoneEl.value = matches[0].phone;
        }
    };

    window.handleOrderSubmit = async function(e) {
        e.preventDefault();
        const fd = new FormData(e.target);
        const billNo = fd.get('billNo');
        const phone = fd.get('phone');
        const name = fd.get('customerName');
        const items = [];
        let totalCost = 0;
        
        document.querySelectorAll('#items-container > div').forEach(row => {
            const n = row.querySelector('.garment-name').value;
            const p = parseFloat(row.querySelector('.garment-price').value) || 0;
            if(n) { items.push({name: n, price: p}); totalCost += p; }
        });

        const method = fd.get('advanceMethod') || 'Cash';
        let cash = 0, upi = 0;
        const totalAdv = parseFloat(fd.get('advancePaid') || 0);

        if (method === 'Mixed') {
            cash = parseFloat(fd.get('mixedCash') || 0);
            upi = parseFloat(fd.get('mixedUPI') || 0);
        } else if (method === 'Cash') {
            cash = totalAdv;
        } else if (method === 'UPI') {
            upi = totalAdv;
        }

        const btn = document.getElementById('order-submit-btn');
        btn.disabled = true;
        btn.innerText = "Syncing Thread...";

        try {
            const orderData = {
                billNo, phone, customerName: name, 
                orderDate: fd.get('orderDate'),
                deliveryDate: fd.get('deliveryDate'),
                description: fd.get('description'),
                items, totalCost,
                advancePaid: totalAdv,
                advanceMethod: method,
                advanceBreakdown: { cash, upi },
                status: 'Order Confirmed',
                measurements: draftMeasurements,
                notesLog: [{
                    text: `Order created with ₹${totalAdv} advance via ${method} ${method === 'Mixed' ? `(Cash: ₹${cash}, UPI: ₹${upi})` : ''}`,
                    timestamp: new Date().toLocaleString()
                }],
                createdAt: Date.now(),
                timestamp: Date.now()
            };

            const docRef = await ORDERS_COL().add(orderData);
            
            // ISSUE #4 FIX: Initialize all loyalty fields when creating new client from Tailoring
            if(!window.erpState.clients.find(c => window.sanitizePhone(c.phone) === window.sanitizePhone(phone))) {
                await CLIENTS_COL().add({name, phone: window.sanitizePhone(phone), createdAt: Date.now(), loyaltyPoints: 0, totalSpent: 0, tier: 'basic'});
            }

            window.closeOrderModal();
            window.showPopup("Booking Confirmation Ready", () => window.sendWA(docRef.id, 1));
            draftMeasurements = null;
        // ISSUE #17 FIX: Use erpAlert instead of native alert for consistent UX
        } catch (e) { console.error(e); window.erpAlert("Order save failed. Check your connection.", "Sync Error", "wifi-off"); }
        btn.disabled = false;
        btn.innerText = "Save Order & Notify Client";
    };

    // --- MEASUREMENT LOGIC ---
    const M_FIELDS = ['style', 'pant_pattern', 'lining', 'body_length', 'full_length', 'shoulder', 'sleeve_length', 'sleeve_round', 'sleeve_pattern', 'armhole', 'front_neck', 'back_neck', 'chest', 'waist', 'seat', 'slit', 'bottom_length', 'bottom_round', 'bottom_waist'];

    window.openMeasurementModal = function(mode = 'existing') {
        const modal = document.getElementById('measurement-modal');
        modal.dataset.mode = mode;
        
        let mData = null;
        let notes = "";

        if (mode === 'draft') {
            mData = draftMeasurements;
            notes = document.getElementById('measure-notes-input')?.value || "";
        } else {
            const o = window.erpState.orders.find(x => x.id === window.selectedOrderId);
            if (!o) return;
            mData = o.measurements;
            notes = o.designNotes || "";
        }

        // Fill Fields
        M_FIELDS.forEach(f => {
            const el = document.getElementById('measure-' + f);
            if (el) el.value = mData ? (mData[f] || '') : '';
        });
        const notesEl = document.getElementById('measure-notes');
        if (notesEl) notesEl.value = notes;

        // Preview Reset
        document.getElementById('measure-image-preview').innerHTML = '';
        modal.classList.remove('hidden');
    };

    window.closeMeasurementModal = () => document.getElementById('measurement-modal').classList.add('hidden');

    window.saveMeasurement = async function() {
        const modal = document.getElementById('measurement-modal');
        const mode = modal.dataset.mode;
        const btn = document.getElementById('btn-save-measurements');
        const ogText = btn.innerText;

        const mData = {};
        M_FIELDS.forEach(f => {
            const el = document.getElementById('measure-' + f);
            if(el && el.value.trim()) mData[f] = el.value.trim();
        });
        const notes = document.getElementById('measure-notes').value;

        if (mode === 'draft') {
            draftMeasurements = mData;
            document.getElementById('draft-measurement-status').classList.remove('hidden');
            window.closeMeasurementModal();
        } else {
            btn.innerText = "Saving to Order...";
            try {
                const o = window.erpState.orders.find(x => x.id === window.selectedOrderId);
                const log = o.notesLog || [];
                log.push({ text: `Measurements Updated / Recorded`, timestamp: new Date().toLocaleString() });

                await ORDERS_COL().doc(window.selectedOrderId).update({
                    measurements: mData,
                    designNotes: notes,
                    notesLog: log
                });
                btn.innerText = "Saved!";
                setTimeout(() => {
                    btn.innerText = ogText;
                    window.closeMeasurementModal();
                    window.openOrderDetails(window.selectedOrderId);
                }, 800);
            } catch (e) { window.erpAlert("Save failed"); btn.innerText = ogText; }
        }
    };

    window.processMeasurementOCR = async (file) => {
        if (!file) return;
        const statusEl = document.getElementById('ocr-status');
        statusEl.innerText = "AI analyzing your handwriting...";
        statusEl.classList.remove('hidden');

        try {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async () => {
                const base64 = reader.result.split(',')[1];
                // L-04: Suppress OCR simulated alert for cleaner UX
                // statusEl.innerText = "AI processing complete (Simulated). Fields filled.";
                // setTimeout(() => statusEl.classList.remove('hidden'), 3000);
            };
        } catch (e) { statusEl.innerText = "OCR failed."; }
    };

    window.updateOrderStatus = async function(id, status) {
        const o = window.erpState.orders.find(x => x.id === id);
        if (!o) return;

        if (status === 'Delivered') {
            if (o.isFromPOS) {
                window.erpAlert("This order originated from POS. Please complete the delivery and final payment in the Retail Terminal (Pending Dues).");
                return;
            }
            window.openDeliveryModal(id);
            return;
        }

        let laborCost = o.tailoringCost || 0;
        if (status === 'Ready') {
            const val = await window.erpPrompt("Enter Labor/Tailoring Cost (Production Expense):", laborCost, 'Stitching Complete');
            if (val === null) return; // Cancelled
            laborCost = parseFloat(val) || 0;
        }

        if(!(await window.erpConfirm(`Move to ${status}?`))) return;
        try {
            let log = o.notesLog || [];
            log.push({ text: `Status updated to ${status}${status === 'Ready' ? ` (Labor Cost: ₹${laborCost})` : ''}`, timestamp: new Date().toLocaleString() });

            const updates = { status, lastUpdated: Date.now(), notesLog: log };
            if (status === 'Ready') updates.tailoringCost = laborCost;

            await ORDERS_COL().doc(id).update(updates);
            
            if (status === 'Ready') window.showPopup("Pickup Alert Ready", () => window.sendWA(id, 2));
            if (status === 'Order Confirmed') window.showPopup("Confirmation Ready", () => window.sendWA(id, 1));
            
            window.renderApp();
            if (window.selectedOrderId === id) window.openOrderDetails(id);
        } catch (e) { window.erpAlert("Update failed"); }
    };

    window.returnToQueue = async function(id) {
        if(!(await window.erpConfirm("Return order to Stitching queue? It will be marked as incomplete."))) return;
        try {
            const o = window.erpState.orders.find(x => x.id === id);
            if (!o) return;
            const log = o.notesLog || [];
            log.push({ text: `[RETURNED] Sent back to Stitching queue for alterations`, timestamp: new Date().toLocaleString() });

            await ORDERS_COL().doc(id).update({
                status: 'Stitching',
                notesLog: log,
                actualDeliveryDate: null 
            });
            window.closeDetailModal();
            window.renderApp();
            window.erpAlert("Order returned to Queue!");
        } catch(e) { window.erpAlert("Failed to return to queue"); }
    };

    // --- UTILS ---

    window.filterTracker = (q) => {
        const v = q.toLowerCase();
        document.querySelectorAll('#tracker-list > div').forEach(c => {
            c.style.display = c.innerText.toLowerCase().includes(v) ? '' : 'none';
        });
    };

    window.openOrderDetails = (id) => {
        const o = window.erpState.orders.find(x => x.id === id);
        if(!o) return;
        window.selectedOrderId = id;
        const bal = (o.totalCost || 0) - (o.advancePaid || 0) - (o.deliveryDiscount || 0);

        let measureHtml = '';
        if (o.measurements && Object.keys(o.measurements).length > 0) {
            const m = o.measurements;
            measureHtml = `
            <div class="bg-violet-50 p-6 rounded-[32px] border border-violet-100 mb-8">
                <div class="flex justify-between items-center mb-4">
                    <p class="text-[10px] font-black text-violet-500 uppercase tracking-widest">Measurements</p>
                    <button onclick="window.openMeasurementModal()" class="text-violet-600 bg-white p-2 rounded-full shadow-sm"><i data-lucide="edit-2" class="w-3 h-3"></i></button>
                </div>
                <div class="grid grid-cols-3 gap-y-4 gap-x-2">
                    ${Object.entries(m).slice(0, 9).map(([k, v]) => `
                        <div>
                            <p class="text-[8px] font-black text-slate-400 uppercase mb-0.5">${window.esc(k.replace('_',' '))}</p>
                            <p class="text-xs font-black text-slate-800">${window.esc(v)}</p>
                        </div>
                    `).join('')}
                    ${Object.keys(m).length > 9 ? `<p class="col-span-3 text-[9px] text-violet-400 font-bold italic">+ More specs in edit mode</p>` : ''}
                </div>
            </div>`;
        } else {
            measureHtml = `
            <button onclick="window.openMeasurementModal()" class="w-full py-4 mb-8 bg-slate-50 border-2 border-dashed border-slate-200 rounded-[32px] text-[10px] font-black text-slate-400 uppercase tracking-widest hover:border-violet-200 hover:text-violet-500 transition-all flex items-center justify-center gap-2">
                <i data-lucide="ruler" class="w-4 h-4"></i> Add Precise Measurements
            </button>`;
        }

        const content = `
            <div class="space-y-8 animate-pop-in">
                <div class="flex justify-between items-start">
                    <div class="min-w-0 flex-1">
                        <p class="text-[9px] font-black text-violet-400 uppercase tracking-widest leading-none mb-1.5">${window.esc(o.billNo)}</p>
                        <h2 class="text-2xl font-black text-slate-900 leading-tight">${window.esc(o.customerName || 'Guest Customer')}</h2>
                        <div class="flex items-center gap-3 mt-3">
                            <a href="tel:${window.esc(o.phone)}" class="bg-slate-100 p-2.5 rounded-xl text-slate-500 hover:bg-slate-200 transition-colors"><i data-lucide="phone" class="w-4 h-4"></i></a>
                            <button onclick="window.sendWA('${o.id}', 1)" class="bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-2">
                                <i data-lucide="message-circle" class="w-4 h-4"></i> WhatsApp
                            </button>
                            ${bal > 0 ? `<button onclick="window.sendWA('${o.id}', 4)" class="bg-rose-50 text-rose-600 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-2"><i data-lucide="bell" class="w-3 h-3"></i> Reminder</button>` : ''}
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</p>
                        ${o.status === 'Delivered' 
                            ? `<span class="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg inline-block">Delivered</span>`
                            : `<select onchange="window.updateOrderStatus('${o.id}', this.value)" class="px-4 py-2 bg-violet-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-violet-200 border-none outline-none">
                                <option value="Order Confirmed" ${o.status === 'Order Confirmed' ? 'selected' : ''}>Confirmed</option>
                                <option value="Stitching" ${o.status === 'Stitching' ? 'selected' : ''}>Stitching</option>
                                <option value="Ready" ${o.status === 'Ready' ? 'selected' : ''}>Ready for Pickup</option>
                                ${!o.isFromPOS ? `<option value="Delivered" ${o.status === 'Delivered' ? 'selected' : ''}>Delivered</option>` : ''}
                            </select>`
                        }
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div class="bg-slate-50 p-6 rounded-[32px] border border-slate-100 flex items-center gap-4">
                        <div class="w-10 h-10 bg-white rounded-2xl flex items-center justify-center text-violet-500 shadow-sm"><i data-lucide="package" class="w-5 h-5"></i></div>
                        <div>
                            <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Received</p>
                            <p class="font-black text-slate-800 text-sm">${window.fmtDate(o.orderDate || o.timestamp)}</p>
                        </div>
                    </div>
                    <div class="bg-violet-50 p-6 rounded-[32px] border border-violet-100 flex items-center gap-4">
                        <div class="w-10 h-10 bg-white rounded-2xl flex items-center justify-center text-violet-600 shadow-sm"><i data-lucide="truck" class="w-5 h-5"></i></div>
                        <div>
                            <p class="text-[9px] font-black text-violet-400 uppercase tracking-widest">Delivery</p>
                            <p class="font-black text-violet-700 text-sm italic font-bold">${window.fmtDate(o.deliveryDate)}</p>
                        </div>
                    </div>
                </div>

                ${measureHtml}

                <div class="space-y-3">
                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Item Inventory</p>
                    <div class="bg-white border-2 border-slate-50 rounded-[32px] overflow-hidden">
                        ${o.items?.map(it => `
                        <div class="p-5 flex justify-between items-center border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                            <span class="font-black text-slate-700 text-sm uppercase">${window.esc(it.name)}</span>
                            <span class="font-bold text-slate-400">${fmt(it.price)}</span>
                        </div>`).join('')}
                    </div>
                </div>

                <div class="${o.isFromPOS ? 'bg-slate-800' : 'bg-slate-900'} p-8 rounded-[40px] shadow-2xl relative overflow-hidden">
                    <div class="absolute -right-10 -bottom-10 w-40 h-40 bg-white/5 rounded-full blur-3xl"></div>
                    <div class="flex justify-between items-end relative z-10">
                        <div>
                            <p class="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-2">Grand Total</p>
                            <h3 class="text-4xl font-black text-white tracking-widest">${fmt(o.totalCost)}</h3>
                            ${o.isFromPOS ? `<p class="text-[8px] font-black text-indigo-400 uppercase mt-2 tracking-widest">Billing managed in Retail POS</p>` : ''}
                        </div>
                        <div class="text-right">
                            ${!o.isFromPOS ? `
                                <p class="text-[10px] font-black text-rose-400 uppercase mb-1">Balance Due</p>
                                <p class="text-2xl font-black text-rose-500 tracking-tighter">${fmt(bal)}</p>
                            ` : `
                                <p class="text-[10px] font-black text-emerald-400 uppercase mb-1">Labor Cost</p>
                                <p class="text-2xl font-black text-emerald-500 tracking-tighter">${fmt(o.tailoringCost || 0)}</p>
                            `}
                        </div>
                    </div>
                </div>

                <div id="activity-log-container" class="space-y-3">
                    <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Activity Log</p>
                    ${(o.notesLog || []).map(n => `<div class="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-[11px] font-medium leading-relaxed"><p>${n.text}</p><p class="text-[8px] text-slate-300 font-bold uppercase mt-2">${n.timestamp}</p></div>`).join('') || '<p class="text-xs text-slate-300 italic px-2">No events recorded</p>'}
                </div>
            </div>
        `;
        document.getElementById('detail-content').innerHTML = content;
        
        // Setup Delete Handler
        const delBtn = document.getElementById('delete-btn-master');
        if (delBtn) delBtn.onclick = () => window.deleteOrder(id);

        // Handle Delivered State restrictions
        const finSection = document.getElementById('fin-section');
        const historyActions = document.getElementById('history-actions');
        const editActions = document.querySelector('#detail-modal .mt-12');
        
        if (finSection) finSection.style.display = (o.status === 'Delivered' || o.isFromPOS) ? 'none' : 'block';
        if (historyActions) {
            historyActions.style.display = o.status === 'Delivered' ? 'block' : 'none';
            if (o.status === 'Delivered') {
                historyActions.innerHTML = `
                    <label class="text-[10px] font-black text-slate-400 uppercase block mb-4 tracking-widest">Archive Actions</label>
                    <button onclick="window.returnToQueue('${o.id}')" class="w-full bg-orange-50 text-orange-600 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 mb-3 shadow-[inset_0_0_0_2px_#ffedd5] hover:bg-orange-100 transition-colors">
                        <i data-lucide="rotate-ccw" class="w-5 h-5"></i> Return to Queue for Alteration
                    </button>
                    <p class="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-2 text-center">Note: Order content is not editable while Delivered. Return to queue to modify measurements or items.</p>
                `;
            }
        }
        
        // Hide Edit & Delete if delivered
        if (editActions) {
            Array.from(editActions.children).forEach((child, index) => {
                // Keep the close button (index 1) typically
                if(child.innerText.includes('Close')) return;
                child.style.display = o.status === 'Delivered' ? 'none' : 'flex';
            });
        }

        document.getElementById('detail-modal').classList.remove('hidden');
        lucide.createIcons();
    };

    window.closeDetailModal = () => document.getElementById('detail-modal').classList.add('hidden');

    window.deleteOrder = async function(id) {
        const pin = await window.erpPrompt("Owner PIN required to delete records:", "", "Authentication Required");
        if (pin === null) return;
        const hashedPin = await window.hashPwd(pin);
        const ownerHash = window.erpState.passwords?.owner || '';
        
        if (hashedPin !== ownerHash) return window.erpAlert("Access Denied: Incorrect Security PIN");

        if (!(await window.erpConfirm("Permanently delete this order record? This will also void any linked POS bills.", "Delete Order Record"))) return;
        try {
            const order = (window.erpState.orders || []).find(o => o.id === id);
            await ORDERS_COL().doc(id).delete();

            // Check and delete linked POS bill
            if (order && order.billNo) {
                const linkedSale = (window.erpState.sales || []).find(s => s.billNo === order.billNo);
                if (linkedSale) {
                    await window.FB.collection('sales').doc(linkedSale.id).delete();
                }
            }

            window.closeDetailModal();
            if (window.renderApp) window.renderApp();
            window.erpAlert("Order and linked records removed.", "Deleted", "check-circle");
        } catch (e) { 
            console.error(e); 
            window.erpAlert("Delete operation failed. Check connection.", "Error", "wifi-off"); 
        }
    };

    // --- FINANCIAL ADJUSTMENTS ---
    window.toggleCostForm = () => { document.getElementById('cost-form').classList.toggle('hidden'); document.getElementById('advance-form').classList.add('hidden'); };
    window.toggleAdvanceForm = () => { document.getElementById('advance-form').classList.toggle('hidden'); document.getElementById('cost-form').classList.add('hidden'); };

    window.calcAdjBal = () => {
        const o = window.erpState.orders.find(x => x.id === window.selectedOrderId);
        if(!o) return;
        // Include deliveryDiscount in balance preview for accuracy
        const curBal = (o.totalCost || 0) - (o.advancePaid || 0) - (o.deliveryDiscount || 0);
        const add = parseFloat(document.getElementById('advance-amt').value) || 0;
        document.getElementById('adj-bal-preview').innerText = "New Balance: ₹" + (curBal - add);
    };

    window.applyAdj = async function(type) {
        const amtEl = type === 'cost' ? document.getElementById('cost-amt') : document.getElementById('advance-amt');
        const rEl = type === 'cost' ? document.getElementById('cost-reason') : document.getElementById('advance-reason');
        const method = document.getElementById('adj-method')?.value || 'Cash';
        
        const amt = parseFloat(amtEl.value) || 0;
        const r = rEl.value || "Adjustment";
        
        if (amt === 0) return;
        const o = window.erpState.orders.find(x => x.id === window.selectedOrderId);
        if (!o) return;

        let cash = 0, upi = 0;
        if (type === 'advance') {
            if (method === 'Mixed') {
                cash = parseFloat(document.getElementById('adj-cash').value) || 0;
                upi = parseFloat(document.getElementById('adj-upi').value) || 0;
            } else if (method === 'Cash') cash = amt;
            else if (method === 'UPI') upi = amt;
        }

        const log = o.notesLog || [];
        const logMsg = type === 'cost' 
            ? `[PRICE ADJ] ₹${amt} - ${r}`
            : `[PAYMENT] ₹${amt} via ${method} ${method === 'Mixed' ? `(Cash: ₹${cash}, UPI: ₹${upi})` : ''} - ${r}`;
            
        log.push({ text: logMsg, timestamp: new Date().toLocaleString() });
        
        const updates = { notesLog: log };
        if (type === 'cost') {
            updates.totalCost = (o.totalCost || 0) + amt;
        } else {
            updates.advancePaid = (o.advancePaid || 0) + amt;
            // Record breakdown if it's a payment
            const existingBreakdown = o.advanceBreakdown || { cash: 0, upi: 0 };
            updates.advanceBreakdown = {
                cash: (existingBreakdown.cash || 0) + cash,
                upi: (existingBreakdown.upi || 0) + upi
            };
            
            // If Delivered and now settled (including delivery discount), record delivery date
            const newBal = (o.totalCost || 0) - (o.deliveryDiscount || 0) - updates.advancePaid;
            if (o.status === 'Delivered' && newBal <= 0) {
                updates.actualDeliveryDate = Date.now();
            }
        }

        try {
            await ORDERS_COL().doc(o.id).update(updates);
            window.erpAlert("Adjustment applied successfully.", "Transacton Logged", "check-circle");
        } catch (e) {
            window.erpAlert("Failed to update record. Check connection.", "Error", "cloud-off");
        }
        
        // M-10: Correct toggle behavior
        if (type === 'cost') window.toggleCostForm(); 
        else document.getElementById('advance-form').classList.add('hidden');
        
        window.openOrderDetails(o.id);
    };

    // --- EDIT ORDER ---
    window.addEditItem = () => {
        const c = document.getElementById('edit-items-container');
        const div = document.createElement('div');
        div.className = 'grid grid-cols-[1fr_80px] gap-2';
        div.innerHTML = `<input type="text" class="edit-item-name tailor-input" placeholder="Item name"><input type="number" class="edit-item-price tailor-input" placeholder="₹">`;
        c.appendChild(div);
    };

    window.openEditModal = () => {
        const o = window.erpState.orders.find(x => x.id === window.selectedOrderId);
        if (!o) return;
        document.getElementById('edit-name').value = o.customerName || '';
        document.getElementById('edit-phone').value = o.phone || '';
        document.getElementById('edit-delivery').value = o.deliveryDate || '';
        document.getElementById('edit-instructions').value = o.description || '';
        
        const container = document.getElementById('edit-items-container');
        container.innerHTML = '';
        (o.items || []).forEach(it => {
            const row = document.createElement('div');
            row.className = "grid grid-cols-2 gap-4";
            row.innerHTML = `
                <input type="text" value="${window.esc(it.name)}" class="edit-item-name px-5 py-3.5 bg-slate-50 border-none rounded-2xl font-bold text-xs outline-none focus:ring-2 focus:ring-violet-400 shadow-inner">
                <input type="number" value="${it.price}" class="edit-item-price px-5 py-3.5 bg-slate-50 border-none rounded-2xl font-bold text-xs outline-none focus:ring-2 focus:ring-violet-400 shadow-inner">
            `;
            container.appendChild(row);
        });
        document.getElementById('edit-modal').classList.remove('hidden');
    };

    window.closeEditModal = () => document.getElementById('edit-modal').classList.add('hidden');

    window.saveEditOrder = async () => {
        const name = document.getElementById('edit-name').value.trim();
        const phone = document.getElementById('edit-phone').value.trim();
        const delivery = document.getElementById('edit-delivery').value;
        const desc = document.getElementById('edit-instructions').value;
        
        const items = [];
        document.querySelectorAll('#edit-items-container > div').forEach(row => {
            const n = row.querySelector('.edit-item-name').value;
            const p = parseFloat(row.querySelector('.edit-item-price').value) || 0;
            if(n) items.push({name: n, price: p});
        });

        const o = window.erpState.orders.find(x => x.id === window.selectedOrderId);
        const originalTotal = o.totalCost || 0;
        const itemsTotal = items.reduce((s, it) => s + it.price, 0);
        
        // If items total changed, update total. Else preserve original (which might have adjustments)
        const finalTotal = (itemsTotal !== (o.items || []).reduce((s, it) => s + it.price, 0)) ? itemsTotal : originalTotal;

        // M-14: Audit log for edits
        const log = o.notesLog || [];
        log.push({ text: `Order edited. Items/Details changed.`, timestamp: new Date().toLocaleString() });

        await ORDERS_COL().doc(window.selectedOrderId).update({
            customerName: name, phone, deliveryDate: delivery, description: desc,
            items, totalCost: finalTotal, notesLog: log
        });
        window.closeEditModal();
        window.openOrderDetails(window.selectedOrderId);
    };

    // --- DELIVERY LOGIC ---
    window.openDeliveryModal = (id) => {
        const o = window.erpState.orders.find(x => x.id === (id || window.selectedOrderId));
        if (!o) return;
        window.selectedOrderId = o.id;
        const bal = (o.totalCost || 0) - (o.advancePaid || 0) - (o.deliveryDiscount || 0);
        
        document.getElementById('del-pending').innerText = "₹" + bal;
        document.getElementById('del-received').value = bal;
        document.getElementById('del-bill-no').innerText = o.billNo;
        document.getElementById('del-discount').value = 0;
        document.getElementById('del-tailoring-cost').value = o.tailoringCost || 0;
        
        // L-11: Refresh Lucide icons in newly rendered modal
        if (window.lucide) window.lucide.createIcons();
        document.getElementById('delivery-modal').classList.remove('hidden');
    };

    window.recalcDel = () => {
        const o = window.erpState.orders.find(x => x.id === window.selectedOrderId);
        const bal = (o.totalCost || 0) - (o.advancePaid || 0) - (o.deliveryDiscount || 0);
        const rec = parseFloat(document.getElementById('del-received').value) || 0;
        const disc = parseFloat(document.getElementById('del-discount').value) || 0;
        const box = document.getElementById('del-status-box');
        const msg = document.getElementById('del-discount-msg');
        
        box.classList.remove('hidden');
        if (rec + disc < bal) {
            msg.innerText = `REMAINING: ₹${bal - rec - disc} (Saving to Dues)`;
            msg.className = "text-[10px] font-black uppercase text-amber-600";
            box.className = "py-3 px-4 rounded-xl text-center bg-amber-50 border border-amber-100";
        } else if (rec + disc > bal) {
            msg.innerText = `OVERPAYMENT: ₹${rec + disc - bal}`;
            msg.className = "text-[10px] font-black uppercase text-indigo-600";
            box.className = "py-3 px-4 rounded-xl text-center bg-indigo-50 border border-indigo-100";
        } else {
            msg.innerText = disc > 0 ? `SETTLED WITH ₹${disc} DISCOUNT` : "SETTLED IN FULL";
            msg.className = "text-[10px] font-black uppercase text-emerald-600";
            box.className = "py-3 px-4 rounded-xl text-center bg-emerald-50 border border-emerald-100";
        }
    };

    window.confirmDelivery = async () => {
        const o = window.erpState.orders.find(x => x.id === window.selectedOrderId);
        const bal = (o.totalCost || 0) - (o.advancePaid || 0) - (o.deliveryDiscount || 0);
        const rec = parseFloat(document.getElementById('del-received').value) || 0;
        const disc = parseFloat(document.getElementById('del-discount').value) || 0;
        const labor = parseFloat(document.getElementById('del-tailoring-cost').value) || 0;
        const method = document.getElementById('del-method').value;

        let cash = 0, upi = 0;
        if (method === 'Mixed') {
            cash = parseFloat(document.getElementById('del-mixed-cash').value) || 0;
            upi = parseFloat(document.getElementById('del-mixed-upi').value) || 0;
        } else if (method === 'Cash') cash = rec;
        else if (method === 'UPI') upi = rec;

        const isPartial = (rec + disc < bal);
        const logMsg = isPartial 
            ? `[PARTIAL DELIVERY] Received ₹${rec} via ${method}. Discount ₹${disc}. Balance ₹${bal - rec - disc} moved to pending.`
            : `[FULL DELIVERY] Order settled. Received ₹${rec} via ${method}. Discount ₹${disc}.`;

        const log = o.notesLog || [];
        log.push({ text: logMsg, timestamp: new Date().toLocaleString() });

        const existingBreakdown = o.advanceBreakdown || { cash: 0, upi: 0 };
        const newStatus = 'Delivered';
        const remark = isPartial ? "Delivered - Pending" : "";

        await ORDERS_COL().doc(o.id).update({
            status: newStatus,
            deliveryDiscount: (o.deliveryDiscount || 0) + disc,
            advancePaid: (o.advancePaid || 0) + rec,
            advanceBreakdown: {
                cash: (existingBreakdown.cash || 0) + cash,
                upi: (existingBreakdown.upi || 0) + upi
            },
            tailoringCost: labor,
            profit: (o.totalCost - (o.deliveryDiscount || 0) - disc) - labor,
            actualDeliveryDate: (rec + disc >= bal) ? Date.now() : (o.actualDeliveryDate || null),
            notesLog: log,
            deliveryRemark: remark
        });

        // Trigger Loyalty Update if any payment received
        if (rec > 0) window.updateClientLoyalty(o.phone);

        document.getElementById('delivery-modal').classList.add('hidden');
        window.showPopup(isPartial ? "Order Delivered (Pending Dues)" : "Order Delivered & Settled", () => window.sendWA(o.id, 3));
    };

    window.updateClientLoyalty = async (phone) => {
        const o = window.erpState.orders.find(x => x.id === window.selectedOrderId);
        if (!o) return;

        const client = (window.erpState.clients || []).find(c => c.phone === phone);
        
        // C-09: Unify Loyalty with POS (use window.calcPoints and window.getLoyaltyTier)
        const tierKey = client ? (client.tier || 'basic') : 'basic';
        const earned = window.calcPoints ? window.calcPoints(o.totalCost || 0, tierKey) : Math.floor((o.totalCost || 0) / 100);
        
        const currentPoints = client ? (client.loyaltyPoints || 0) : 0;
        const currentSpent = client ? (client.totalSpent || 0) : 0;
        const newPointsTotal = currentPoints + earned;
        const newSpentTotal = currentSpent + (o.totalCost || 0);
        
        // Recalculate tier based on NEW spending
        const newTier = window.getLoyaltyTier ? window.getLoyaltyTier(newSpentTotal) : tierKey;

        try {
            // Update order with snapshot
            await ORDERS_COL().doc(o.id).update({
                loyaltySnapshot: { earned, total: newPointsTotal, tier: newTier }
            });

            // Update client points and total spent
            if (client) {
                await CLIENTS_COL().doc(client.id).update({
                    loyaltyPoints: firebase.firestore.FieldValue.increment(earned),
                    totalSpent: firebase.firestore.FieldValue.increment(o.totalCost || 0),
                    tier: newTier
                });
            }
        } catch (e) {
            console.error("Loyalty update failed:", e);
        }
    };

    window.printOrderReceipt = function(billNo) {
        let bNo = billNo;
        if (!bNo) {
            const el = document.getElementById('del-bill-no');
            if (el) bNo = el.innerText;
        }
        if (!bNo) {
            const o = window.erpState.orders.find(x => x.id === window.selectedOrderId);
            if (o) bNo = o.billNo;
        }
        
        const o = window.erpState.orders.find(x => x.billNo === bNo);
        if (!o) return window.erpAlert("Order not found: " + bNo, "Error", "alert-triangle");

        const printData = {
            billNo: o.billNo,
            customerName: o.customerName,
            customerPhone: o.phone,
            date: o.orderDate || o.timestamp,
            recordedBy: o.recordedBy || "",
            items: o.items || [],
            subtotal: o.totalCost || 0,
            discount: o.deliveryDiscount || 0,
            taxVal: 0, 
            total: (o.totalCost || 0) - (o.deliveryDiscount || 0),
            paid: o.advancePaid || 0,
            balance: Math.max(0, (o.totalCost || 0) - (o.deliveryDiscount || 0) - (o.advancePaid || 0)),
            loyaltySnapshot: o.loyaltySnapshot,
            tailoringRefs: [o.billNo]
        };

        window.generateThermalPrint(printData);
    };

    window.exportAll = () => {
        const data = window.erpState.orders.map(o => ({
            Bill: o.billNo,
            Client: o.customerName,
            Phone: o.phone,
            Total: o.totalCost,
            Paid: o.advancePaid,
            Status: o.status,
            Date: o.orderDate
        }));
        
        if (data.length === 0) {
            window.erpAlert("No orders to export.", "Empty", "package");
            return;
        }

        const csv = [
            Object.keys(data[0]).join(','),
            ...data.map(row => Object.values(row).map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
        ].join('\n');
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lavish-tailoring-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
    };

})();
