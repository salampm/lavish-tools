// Shared Application State and Logic
window.erpState = {
    counter: 2499, tab: 'pos', role: null,
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
        { id: 'pos', icon: 'HandCoins', label: 'Retail POS', url: 'pos.html' },
        { id: 'tailoring', icon: 'Scissors', label: 'Tailoring', url: 'tailoring.html' },
        { id: 'expenses', icon: 'Wallet', label: 'Expense Tracker', url: 'expenses.html' },
        { id: 'inventory', icon: 'Package', label: 'Inventory', url: 'inventory.html' },
        { id: 'clients', icon: 'Users', label: 'Clients', url: 'pos.html?tab=clients' },
        { id: 'reports', icon: 'FileSpreadsheet', label: 'Master Reports', url: 'pos.html?tab=reports' },
        { id: 'settings', icon: 'Settings', label: 'Master Settings', url: 'pos.html?tab=settings' }
    ],
    isOnline: navigator.onLine,
    pendingSyncCount: 0
};

// --- AUTH SYSTEM ---
window.showLoginModal = () => {
    const existing = document.getElementById('login-modal-overlay');
    if (existing) return;

    const overlay = document.createElement('div');
    overlay.id = 'login-modal-overlay';
    overlay.className = 'fixed inset-0 bg-slate-900/95 z-[99999] flex items-center justify-center p-6 backdrop-blur-xl';
    overlay.innerHTML = `
        <div class="bg-white w-full max-w-[380px] rounded-[48px] p-10 shadow-2xl animate-pop-in text-center relative">
            <div style="margin-bottom: 40px;">
                <div style="width: 64px; height: 64px; background: #4f46e5; border-radius: 20px; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px;">
                    <i data-lucide="flower-2" style="color: white; width: 32px; height: 32px;"></i>
                </div>
                <h2 style="font-size: 24px; font-weight: 900; color: #1e293b; text-transform: uppercase; letter-spacing: -0.025em; margin: 0;">System Locked</h2>
                <p style="color: #94a3b8; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.2em; margin-top: 8px;">Authentication Required</p>
            </div>

            <div style="text-align: left;">
                <label style="font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin-left: 4px; display: block; margin-bottom: 8px;">Access Key</label>
                <input id="auth_pass" type="password" placeholder="••••••••" 
                    style="width: 100%; padding: 16px; background: #f8fafc; border: 2px solid #f1f5f9; border-radius: 20px; font-weight: 900; font-size: 18px; text-align: center; letter-spacing: 4px; outline: none; margin-bottom: 24px;">
                
                <button id="auth_btn" style="width: 100%; padding: 18px; background: #4f46e5; color: white; border: none; border-radius: 20px; font-weight: 900; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; cursor: pointer;">Unlock Terminal</button>
            </div>

            <div style="margin-top: 40px; padding-top: 32px; border-top: 1px solid #f1f5f9;">
                <p style="font-size: 9px; font-weight: 900; color: #cbd5e1; text-transform: uppercase; letter-spacing: 0.2em; margin: 0;">Lavish Lavender OS v2.0</p>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    if (window.lucide) lucide.createIcons();

    const passInput = document.getElementById('auth_pass');
    const authBtn = document.getElementById('auth_btn');
    
    const tryLogin = () => {
        const val = passInput.value;
        if (val === 'Lavish1234') {
            sessionStorage.setItem('lavish_user_role', 'Staff');
            window.erpState.role = 'Staff';
            overlay.remove();
            if (window.renderApp) window.renderApp();
        } else if (val === 'Swali4783') {
            sessionStorage.setItem('lavish_user_role', 'Owner');
            window.erpState.role = 'Owner';
            overlay.remove();
            if (window.renderApp) window.renderApp();
        } else {
            passInput.style.borderColor = '#f43f5e';
            setTimeout(() => passInput.style.borderColor = '#f1f5f9', 1000);
            passInput.value = '';
            alert("Security Breach: Invalid Password");
        }
    };

    authBtn.onclick = tryLogin;
    passInput.onkeydown = (e) => { if (e.key === 'Enter') tryLogin(); };
    passInput.focus();
};

window.checkAuth = () => {
    const role = sessionStorage.getItem('lavish_user_role');
    if (!role) {
        window.showLoginModal();
    } else {
        window.erpState.role = role;
    }
};
window.checkAuth();

window.logout = () => {
    sessionStorage.removeItem('lavish_user_role');
    location.reload();
};

window.switchRole = (target) => {
    if (window.erpState.role === target) return;
    if (target === 'Owner') {
        window.showLoginModal();
    } else {
        sessionStorage.setItem('lavish_user_role', 'Staff');
        window.erpState.role = 'Staff';
        if (window.renderApp) window.renderApp();
    }
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

            <!-- User Auth & Role Switcher -->
            <div class="mt-6 pt-6 border-t border-white/5">
                <div class="flex items-center justify-between px-3 py-4 bg-white/5 rounded-2xl border border-white/5 mb-4 hover:border-indigo-500/20 transition-all">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                            <i data-lucide="${window.erpState.role === 'Owner' ? 'Crown' : 'User'}" class="w-4 h-4"></i>
                        </div>
                        <div>
                            <p class="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Access Level</p>
                            <p class="text-xs font-black text-white uppercase">${window.erpState.role || 'Guest'}</p>
                        </div>
                    </div>
                    <button onclick="window.logout()" class="p-2 text-slate-600 hover:text-rose-400 transition-colors" title="Logout">
                        <i data-lucide="log-out" class="w-4 h-4"></i>
                    </button>
                </div>

                <!-- Role Toggle -->
                <div class="flex bg-white/5 rounded-xl p-1 gap-1">
                    <button onclick="window.switchRole('Staff')" class="flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${window.erpState.role === 'Staff' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}">Staff</button>
                    <button onclick="window.switchRole('Owner')" class="flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${window.erpState.role === 'Owner' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}">Owner</button>
                </div>

                <p class="text-[8px] font-black text-slate-600 uppercase tracking-[0.2em] text-center mt-6">Syncing Live with Cloud</p>
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
