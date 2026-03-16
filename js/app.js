// Shared Application State and Logic
window.erpState = {
    counter: 2499, tab: 'pos', role: 'staff',
    items: [], sales: [], orders: [], clients: [], suppliers: [], cart: [], tickets: [],
    expenses: [],
    expenseCategories: [
        { name: 'Rent', requiresBill: false, icon: 'Home' },
        { name: 'Electricity', requiresBill: true, icon: 'Zap' },
        { name: 'Staff Salary', requiresBill: false, icon: 'Users' },
        { name: 'Materials', requiresBill: true, icon: 'ShoppingBag' },
        { name: 'Handwork Charge', requiresBill: true, icon: 'Scissors' },
        { name: 'Dye Charge', requiresBill: true, icon: 'Droplets' },
        { name: 'Marketing', requiresBill: false, icon: 'Target' }
    ],
    expenseTab: 'terminal',
    dashboardFilter: 'monthly',
    dashboardStart: null, dashboardEnd: null,
    isSidebarOpen: false, isItemsOpen: false, mobileCartOpen: false,
    search: '', user: null, categoryFilter: '',
    expenseSearch: '', ticketSearch: '',
    taxes: [{ label: 'No Tax', val: 0 }, { label: '5%', val: 5 }, { label: '12%', val: 12 }, { label: '18%', val: 18 }],
    discounts: [{ label: 'Wedding Special', val: 500, type: 'cash' }, { label: '10% Off', val: 10, type: 'pct' }],
    activeTax: 0, taxNo: 'GSTIN123456789',
    printerWidth: '58',
    activeSettingsSection: 'menu',
    whatsappTemplates: {
        booking: '*Lavish Lavender Bridal Boutique* 🌸\n\nHello *{customerName}*,\n\nYour order has been successfully booked.\n\n*Bill No:* {billNo}\n*Total Amount:* Rs.{totalCost}\n*Advance Received:* Rs.{advancePaid}\n*Balance:* Rs.{balance}\n\n*Expected Delivery:* {deliveryDate}\n\nPlease keep this bill number for reference. We appreciate your trust in Lavish Lavender. 🙏',
        ready: '*Lavish Lavender Bridal Boutique* 🌸\n\nHello *{customerName}*,\n\nGood news! Your order is ready for pickup. ✅\n\n*Bill No:* {billNo}\n*Balance Payable:* Rs.{balance}\n\nPlease visit our boutique to collect your order.\n\n*Location:* 📍\nhttps://share.google/iR4s2zrLMHoiTTZ66\n\nWe look forward to seeing you.',
        delivered: '*Lavish Lavender Bridal Boutique* 🌸\n\nHello *{customerName}*,\n\nYour order has been successfully delivered. ✅\n\n*Your Receipt:* 📄\nhttps://www.lavishlavender.in/receipt/?bill={billNo}\n\nThank you for choosing Lavish Lavender. 🙏\n\nIf you were happy with our service, please leave us a 5-star review: ⭐\nhttps://g.page/r/CSDbXBIvElTEEBM/review\n\nVisit again soon!',
        reminder: 'Hi {customerName}, 🌸 This is a friendly reminder from *Lavish Lavender* regarding your bill *{billNo}*.\n\nThere is a pending balance of *{balance}*. You can view your receipt details here: https://www.lavishlavender.in/receipt/?bill={billNo}\n\nWe appreciate your support! 🙏\n\nVisit again soon! 🌸'
    },
    menuItems: [
        { id: 'dashboard', icon: 'LayoutDashboard', label: 'Dashboard', url: 'index.html' },
        { id: 'pos', icon: 'HandCoins', label: 'Retail POS', url: 'POS.html' },
        { id: 'tailoring', icon: 'Scissors', label: 'Tailoring', url: 'tailoring.html' },
        { id: 'expenses', icon: 'Wallet', label: 'Expense Tracker', url: 'expenses.html' },
        { id: 'inventory', icon: 'Package', label: 'Inventory', url: 'inventory.html' },
        { id: 'clients', icon: 'Users', label: 'Clients', url: 'POS.html?tab=clients' },
        { id: 'reports', icon: 'FileSpreadsheet', label: 'Master Reports', url: 'POS.html?tab=reports' },
        { id: 'settings', icon: 'Settings', label: 'Master Settings', url: 'POS.html?tab=settings' }
    ],
    isOnline: navigator.onLine,
    pendingSyncCount: 0
};

// Offline First Cache System
window.loadLocalCache = () => {
    try {
        const cache = localStorage.getItem('lavish_local_cache');
        if (cache) {
            const parsed = JSON.parse(cache);
            ['items', 'sales', 'orders', 'clients', 'suppliers', 'expenses', 'expenseCategories', 'tickets'].forEach(k => {
                if (parsed[k] && parsed[k].length > 0) window.erpState[k] = parsed[k];
            });
            if (parsed.settings) {
                window.erpState.printerWidth = parsed.settings.printerWidth || '58';
                window.erpState.whatsappTemplates = parsed.settings.whatsappTemplates || window.erpState.whatsappTemplates;
                if (parsed.settings.taxes) window.erpState.taxes = parsed.settings.taxes;
                if (parsed.settings.discounts) window.erpState.discounts = parsed.settings.discounts;
            }
        }
    } catch(e) {}
};
window.saveLocalCache = () => {
    try {
        const cacheObj = { settings: { printerWidth: window.erpState.printerWidth, whatsappTemplates: window.erpState.whatsappTemplates, taxes: window.erpState.taxes, discounts: window.erpState.discounts } };
        ['items', 'sales', 'orders', 'clients', 'suppliers', 'expenses', 'expenseCategories', 'tickets'].forEach(k => {
            cacheObj[k] = window.erpState[k];
        });
        localStorage.setItem('lavish_local_cache', JSON.stringify(cacheObj));
    } catch(e) {}
};
window.loadLocalCache();

// Common Helpers
window.fmt = (v) => '₹' + (v || 0).toLocaleString('en-IN');
window.fmtDate = (d) => {
    if(!d) return 'N/A';
    const date = new Date(d);
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};



window.navBtn = (item) => {
    const currentLoc = window.location.pathname.toLowerCase();
    const currentSearch = window.location.search.toLowerCase() || "";
    
    const [targetPathPart, targetSearchPart] = item.url.split('?');
    const targetPath = targetPathPart.toLowerCase();
    const targetSearch = targetSearchPart ? '?' + targetSearchPart.toLowerCase() : "";

    const pathParts = currentLoc.split('/');
    const currentFile = pathParts[pathParts.length - 1];
    const active = currentFile === targetPath && currentSearch === targetSearch;
    
    return `
    <div class="menu-item-wrapper relative group">
        <button onclick="location.href='${item.url}'" 
                class="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-bold pointer-events-auto ${active ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-500/30' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}">
            <i data-lucide="${item.icon}" class="w-4 h-4"></i>
            <span class="flex-1 text-left">${item.label}</span>
        </button>
    </div>`;
};

window.renderSidebar = (activePage) => {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    
    sidebar.innerHTML = `
        <div class="p-6 h-full flex flex-col">
            <!-- Brand -->
            <div class="flex items-center gap-3 mb-10 px-2 cursor-pointer" onclick="location.href='index.html'">
                <div class="bg-indigo-600 p-2 rounded-lg">
                    <i data-lucide="flower-2" class="text-white w-6 h-6"></i>
                </div>
                <div>
                    <h1 class="font-black text-white text-lg tracking-tighter uppercase">Lavish Lavender</h1>
                    <p class="text-[9px] text-slate-500 font-black uppercase tracking-widest mt-1">Management Suite</p>
                </div>
            </div>

            <!-- Navigation -->
            <nav id="sidebar-nav" class="space-y-2 flex-1 scrollbar-hide overflow-y-auto">
                ${window.erpState.menuItems.map(item => window.navBtn(item)).join('')}
            </nav>

            <div class="pt-6 border-t border-white/5">
                <p class="text-[8px] font-black text-slate-600 uppercase tracking-widest text-center">Syncing Live with Cloud</p>
            </div>
        </div>
    `;
    lucide.createIcons();
};



// Network status tracking
window.addEventListener('online', () => {
    window.erpState.isOnline = true;
    if (window.scheduleRender) window.scheduleRender();
});
window.addEventListener('offline', () => {
    window.erpState.isOnline = false;
    if (window.scheduleRender) window.scheduleRender();
});

// RAF Debounce for rendering
let _renderScheduled = false;
window.scheduleRender = () => {
    if (_renderScheduled) return;
    _renderScheduled = true;
    requestAnimationFrame(() => {
        _renderScheduled = false;
        if (window.renderApp) window.renderApp();
        if (window.saveLocalCache) window.saveLocalCache();
    });
};
