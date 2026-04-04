window.APP_VERSION = "v2.5.3";

// === NATIVE APP ENFORCER (Disable Pinch-to-Zoom for iOS/Android App Feel) ===
document.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) e.preventDefault();
}, { passive: false });

document.addEventListener('gesturestart', (e) => {
    e.preventDefault();
}, { passive: false });

// === PWA STANDALONE BACK NAVIGATION LOCK ===
if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
    history.pushState(null, document.title, location.href);
    window.addEventListener('popstate', function () {
        history.pushState(null, document.title, location.href);
    });
}

// --- CACHE & UPDATE MANAGEMENT ---
// 1. Force unregister old Service Workers that often block updates
// Legacy SW cleanup — remove after one deployment cycle
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
        for (let reg of registrations) {
            if (reg.scope && reg.scope.includes(location.origin)) {
                reg.unregister();
            }
        }
    });
}

// 2. Periodic Remote Update Check
window.checkAppUpdates = async () => {
    try {
        const response = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
        const remote = await response.json();
        const localBuild = localStorage.getItem('app_last_build');
        
        // If it's a new session or build is newer than local
        if (localBuild && remote.build > parseInt(localBuild)) {
            window.showUpdateNotification(remote.version);
        }
        localStorage.setItem('app_last_build', remote.build);
        localStorage.setItem('app_curr_version', remote.version);
    } catch (e) { console.warn("Update check failed", e); }
};

window.showUpdateNotification = (v) => {
    if (document.getElementById('update-toast')) return;
    const toast = document.createElement('div');
    toast.id = 'update-toast';
    toast.className = "fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 shadow-2xl rounded-[32px] p-6 z-[9999] border border-slate-700 animate-pop-in flex items-center gap-6 max-w-[90%]";
    toast.innerHTML = `
        <div class="w-12 h-12 bg-violet-600 rounded-full flex items-center justify-center flex-shrink-0 pulse">
            <i data-lucide="zap" class="w-6 h-6 text-white text-violet-100"></i>
        </div>
        <div class="min-w-0">
            <p class="text-[10px] font-black text-violet-400 uppercase tracking-widest mb-1">New Update Available</p>
            <p class="text-white font-bold text-sm">Version ${v} is ready for you</p>
            <div class="flex items-center gap-4">
                <button onclick="window.hardReloadApp()" class="px-6 py-3 bg-violet-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-violet-700 transition-all shadow-lg shadow-violet-500/20 whitespace-nowrap">Reload</button>
                <button onclick="this.closest('#update-toast').remove()" class="p-3 text-slate-500 hover:text-white transition-colors rounded-xl" title="Dismiss">
                    <i data-lucide="x" class="w-4 h-4"></i>
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(toast);
    if (window.lucide) lucide.createIcons();
};

window.hardReloadApp = () => {
    localStorage.removeItem('erp_cache');
    window.location.reload();
};

// Check for updates on startup
window.addEventListener('load', () => {
    setTimeout(window.checkAppUpdates, 3000); // Check 3 seconds after load
});

window.sanitizePhone = (phone) => {
    if (!phone) return "";
    let p = phone.toString().replace(/\D/g, '');
    if (p.startsWith('0091')) p = p.substring(4);
    else if (p.startsWith('91') && p.length > 10) p = p.substring(2);
    else if (p.startsWith('0') && p.length === 11) p = p.substring(1);
    // Ensure max 10 digits for Indian numbers
    if (p.length > 10) p = p.slice(-10);
    return p;
};

window.sanitizeText = (t) => {
    if (!t) return "";
    return t.toString().replace(/<[^>]*>?/gm, '');
};

// Local Cache Helpers
window.saveLocalState = () => {
    try {
        localStorage.setItem('erp_cache', JSON.stringify({
            items: window.erpState.items,
            clients: window.erpState.clients,
            orders: window.erpState.orders,
            sales: window.erpState.sales,
            expenses: window.erpState.expenses,
            tickets: window.erpState.tickets,
            settings: {
                printerWidth: window.erpState.printerWidth,
                whatsappTemplates: window.erpState.whatsappTemplates,
                taxes: window.erpState.taxes,
                discounts: window.erpState.discounts,
                passwords: window.erpState.passwords,
                staff: window.erpState.staff || [],
                printerConfig: window.erpState.printerConfig,
                dashboardConfig: window.erpState.dashboardConfig,
                gstin: window.erpState.gstin
            },
            timestamp: Date.now()
        }));
    } catch (e) { console.warn("Cache save failed", e); }
};

let _savePending = false;
window.debouncedSave = () => {
    if (_savePending) return;
    _savePending = true;
    setTimeout(() => {
        _savePending = false;
        window.saveLocalState();
    }, 2000);
};

window.loadLocalState = () => {
    const cache = localStorage.getItem('erp_cache');
    if (cache) {
        try {
            const data = JSON.parse(cache);
            if (data.items) window.erpState.items = data.items;
            if (data.clients) window.erpState.clients = data.clients;
            if (data.orders) window.erpState.orders = data.orders;
            if (data.sales) window.erpState.sales = data.sales;
            if (data.expenses) window.erpState.expenses = data.expenses;
            if (data.tickets) window.erpState.tickets = data.tickets;
            if (data.settings) {
                Object.assign(window.erpState, data.settings);
            }
            return true;
        } catch (e) { console.error("Cache load failed", e); }
    }
    return false;
};

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
    expenseFilter: 'today',
    dashboardFilter: 'today',
    dashboardStart: null, dashboardEnd: null,
    isSidebarOpen: false, isItemsOpen: false, mobileCartOpen: false,
    search: '', user: null, categoryFilter: '',
    expenseSearch: '', ticketSearch: '',
    historySearch: '', historySort: 'desc', historyFilter: 'all',
    trackerSortKey: 'billNo', trackerSortDir: 'desc',
    taxes: [{ label: 'No Tax', val: 0 }, { label: '5%', val: 5 }, { label: '12%', val: 12 }, { label: '18%', val: 18 }],
    discounts: [{ label: 'Wedding Special', val: 500, type: 'cash' }, { label: '10% Off', val: 10, type: 'pct' }],
    activeTax: 0, taxNo: 'GSTIN123456789',
    printerWidth: '58',
    loyalty: { enabled: true, pointsPer100: 5, eliteThreshold: 10000, goldThreshold: 50000 },
    activeSettingsSection: 'menu',
    whatsappTemplates: {
        booking: '*Lavish Lavender Bridal Boutique* 🌸\n\nHello *{customerName}*,\n\nYour order has been successfully booked.\n\n*Bill No:* {billNo}\n*Amount:* Rs.{totalCost}\n*Advance:* Rs.{advancePaid}\n*Balance:* Rs.{balance}\n\n*Pickup Date:* {deliveryDate}\n\n✨ *Loyalty Status*\n{pointsEarned} PT Erned | {totalPoints} Total PT | {tier} Tier\n\nThank you for choosing Lavish Lavender. 🙏',
        ready: '*Lavish Lavender Bridal Boutique* 🌸\n\nHello *{customerName}*,\n\nGood news! Your order is ready for pickup. ✅\n\n*Bill No:* {billNo}\n*Balance Payable:* Rs.{balance}\n\n📍 *Location:*\nhttps://share.google/iR4s2zrLMHoiTTZ66\n\n✨ *Loyalty Status*\n{pointsEarned} PT Erned | {totalPoints} Total PT | {tier} Tier\n\nSee you soon! 🙏',
        delivered: '*Lavish Lavender Bridal Boutique* 🌸\n\nHello *{customerName}*,\n\nYour order has been successfully delivered. ✅\n\n*Receipt:* 📄\nhttps://www.lavishlavender.in/receipt/?bill={billNo}\n\n✨ *Loyalty Status*\n{pointsEarned} PT Erned | {totalPoints} Total PT | {tier} Tier\n\nThank you! 🙏',
        reminder: 'Hi {customerName}, 🌸 Friendly reminder from *Lavish Lavender* for bill *{billNo}*.\n\nPending: *Rs.{balance}*.\n\n✨ *Loyalty Status*\n{totalPoints} Total PT | {tier} Tier\n\nVisit again! 🙏'
    },
    menuItems: [
        { id: 'dashboard', icon: 'layout-dashboard', label: 'Dashboard', url: 'index.html', roles: ['Owner'] },
        { id: 'pos', icon: 'hand-coins', label: 'Retail POS', url: 'pos.html' },
        { id: 'tailoring', icon: 'scissors', label: 'Tailoring', url: 'tailoring.html' },
        { id: 'receipts', icon: 'receipt', label: 'Receipts Ledger', url: 'pos.html?tab=receipts' },
        { id: 'expenses', icon: 'wallet', label: 'Expense Tracker', url: 'expenses.html' },
        { id: 'inventory', icon: 'package', label: 'Inventory', url: 'inventory.html', roles: ['Owner'] },
        { id: 'clients', icon: 'users', label: 'Clients', url: 'pos.html?tab=clients' },
        { id: 'reports', icon: 'file-spreadsheet', label: 'Master Reports', url: 'pos.html?tab=reports', roles: ['Owner'] },
        { id: 'settings', icon: 'settings', label: 'Master Settings', url: 'pos.html?tab=settings', roles: ['Owner'] }
    ],
    isOnline: navigator.onLine,
    pendingSyncCount: 0,
    passwords: { staff: '', owner: '' }
};

// --- AUTH SYSTEM ---
    // --- UI HELPERS ---
    window.erpAlert = (msg, title = "System Notification", icon = "bell") => {
        const modal = document.createElement('div');
        modal.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[10000] p-4";
        modal.innerHTML = `
            <div class="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl animate-pop-in border border-slate-100 text-center relative overflow-hidden">
                <div class="absolute -right-6 -top-6 w-32 h-32 bg-violet-50 rounded-full blur-3xl"></div>
                <div class="w-16 h-16 bg-violet-50 text-violet-600 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-violet-100 relative">
                    <i data-lucide="${icon}" class="w-8 h-8"></i>
                </div>
                <h3 class="text-xl font-black text-slate-900 mb-2 uppercase tracking-tighter">${window.esc(title)}</h3>
                <p class="text-xs font-bold text-slate-400 uppercase tracking-widest leading-relaxed mb-8 px-4">${window.esc(msg)}</p>
                <button id="erp_alert_close" class="w-full py-5 bg-violet-600 text-white rounded-[24px] font-black uppercase text-[10px] tracking-widest shadow-xl shadow-violet-100 active:scale-95 transition-all">Understood</button>
            </div>
        `;
        document.body.appendChild(modal);
        if (window.lucide) lucide.createIcons();
        document.getElementById('erp_alert_close').onclick = () => modal.remove();
    };

    window.snapRedeemToMultiple = (sub) => {
            const el = document.getElementById('cm_redeem_amt');
            if (!el) return;
            let val = parseInt(el.value || 0);
            if (!val) return;
            // Snap to nearest multiple of 500 (standard rounding or floor? User says "should be in multiple", let's floor)
            val = Math.floor(val / 500) * 500;
            // Cap at client balance floored to 500
            const phone = document.getElementById('cm_client_phone')?.value || '';
            const c = window.erpState.clients.find(x => window.sanitizePhone(x.phone) === window.sanitizePhone(phone));
            const maxRedeem = c ? Math.floor((c.loyaltyPoints || 0) / 500) * 500 : 0;
            val = Math.min(val, maxRedeem);
            el.value = val > 0 ? val : '';
            window.updateCMFinal(sub);
        };
    window.erpConfirm = (msg, title = "Action Required") => {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[10000] p-4";
            modal.innerHTML = `
            <div class="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl animate-pop-in border border-slate-100 text-center relative overflow-hidden">
                <div class="absolute -right-6 -top-6 w-32 h-32 bg-slate-50 rounded-full blur-3xl"></div>
                <div class="w-16 h-16 bg-slate-50 text-slate-400 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-slate-100 relative">
                    <i data-lucide="help-circle" class="w-8 h-8"></i>
                </div>
                <h3 class="text-xl font-black text-slate-900 mb-2 uppercase tracking-tighter">${window.esc(title)}</h3>
                <p class="text-xs font-bold text-slate-400 uppercase tracking-widest leading-relaxed mb-8 px-4">${window.esc(msg)}</p>
                <div class="flex gap-3">
                    <button id="erp_confirm_cancel" class="flex-1 py-5 bg-slate-100 text-slate-500 rounded-[24px] font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all">Cancel</button>
                    <button id="erp_confirm_ok" class="flex-1 py-5 bg-violet-600 text-white rounded-[24px] font-black uppercase text-[10px] tracking-widest shadow-xl shadow-violet-100 active:scale-95 transition-all">Confirm</button>
                </div>
            </div>
        `;
            document.body.appendChild(modal);
            if (window.lucide) lucide.createIcons();

            document.getElementById('erp_confirm_cancel').onclick = () => { modal.remove(); resolve(false); };
            document.getElementById('erp_confirm_ok').onclick = () => { modal.remove(); resolve(true); };
        });
    };

window.hashPwd = async (pwd) => {
    const enc = new TextEncoder().encode(pwd + 'lavish-salt-2024');
    const hash = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
};

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
                <div id="auth-status" style="display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 12px;">
                    <span id="auth-status-dot" style="width: 6px; height: 6px; border-radius: 50%; background: #94a3b8; display: inline-block;"></span>
                    <span id="auth-status-text" style="font-size: 8px; font-weight: 900; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em;">Connecting to Cloud...</span>
                </div>
            </div>

            <div style="text-align: left;">
                <label style="font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin-left: 4px; display: block; margin-bottom: 8px;">Access Key</label>
                <input id="auth_pass" type="password" placeholder="••••••••" 
                    style="width: 100%; padding: 16px; background: #f8fafc; border: 2px solid #f1f5f9; border-radius: 20px; font-weight: 900; font-size: 18px; text-align: center; letter-spacing: 4px; outline: none; margin-bottom: 24px;">
                
                <button id="auth_btn" style="width: 100%; padding: 18px; background: #4f46e5; color: white; border: none; border-radius: 20px; font-weight: 900; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; cursor: pointer;">Unlock Terminal</button>
            </div>

            <div style="margin-top: 40px; padding-top: 32px; border-top: 1px solid #f1f5f9;">
                <p style="font-size: 9px; font-weight: 900; color: #cbd5e1; text-transform: uppercase; letter-spacing: 0.2em; margin: 0;">Lavish Lavender OS ${window.APP_VERSION}</p>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    if (window.lucide) lucide.createIcons();

    const passInput = document.getElementById('auth_pass');
    const authBtn = document.getElementById('auth_btn');
    
    const tryLogin = async () => {
        const val = passInput.value;
        const creds = window.erpState.passwords || {};
        const staffList = window.erpState.staff || [];
        
        const hashedVal = await window.hashPwd(val);
        const isStaffPin = staffList.some(s => s.code === val);
        
        // H-02: Fallback logic for Swali4783 and Lavish4783 if DB is restricted or empty
        const isFallbackOwner = (val === 'Swali4783');
        const isFallbackStaff = (val === 'Lavish4783');
        
        // Transition: Check both hashed and unhashed for legacy support
        if (hashedVal === creds.staff || val === creds.staff || isStaffPin || isFallbackStaff) {
            sessionStorage.setItem('lavish_user_role', 'Staff');
            window.erpState.role = 'Staff';
            overlay.remove();
            if (window.renderApp) window.renderApp();
            console.log("Login success: Staff (via " + (isFallbackStaff ? "Fallback" : "DB") + ")");
        } else if (hashedVal === creds.owner || val === creds.owner || isFallbackOwner) {
            sessionStorage.setItem('lavish_user_role', 'Owner');
            window.erpState.role = 'Owner';
            overlay.remove();
            if (window.renderApp) window.renderApp();
            console.log("Login success: Owner (via " + (isFallbackOwner ? "Fallback" : "DB") + ")");
        } else {
            passInput.style.borderColor = '#f43f5e';
            setTimeout(() => passInput.style.borderColor = '#f1f5f9', 1000);
            passInput.value = '';
            window.erpAlert("Invalid credentials. Access denied.", "Security Alert", "shield-off");
            console.warn("Login failed: Incorrect PIN attempt.");
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
    window.showLoginModal();
};

// Common Helpers
    window.fmt = (n) => '₹' + (n || 0).toLocaleString('en-IN');
    
    // M-15: XSS Protection Helper (Robust Version)
    window.esc = (str) => {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    };

    // M-01: Shared History Sort State
    window.toggleHistorySort = () => {
        window.erpState.historySort = window.erpState.historySort === 'desc' ? 'asc' : 'desc';
        if (window.renderApp) window.renderApp();
    };
window.fmtDate = (d, includeYear = true) => {
    if (!d) return 'N/A';
    let dt;
    try {
        if (d && typeof d === 'object' && typeof d.toDate === 'function') {
            dt = d.toDate();
        } else {
            dt = new Date(d);
        }
        if (!dt || isNaN(dt.getTime())) return 'N/A';
        const opts = { day: '2-digit', month: 'short' };
        if (includeYear) opts.year = 'numeric';
        return dt.toLocaleDateString('en-IN', opts);
    } catch (e) {
        return 'N/A';
    }
};



window.getTs = (field) => {
    if (!field) return 0;
    if (typeof field === 'number') return field;
    if (field.toMillis) return field.toMillis();
    if (field.toDate) return field.toDate().getTime();
    if (field instanceof Date) return field.getTime();
    const d = new Date(field);
    return isNaN(d.getTime()) ? 0 : d.getTime();
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
        <button onclick="${item.onclick ? item.onclick : `window.toggleSidebar(false); setTimeout(() => location.href='${item.url}', 150);`}" 
                class="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-bold pointer-events-auto ${active ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-500/30' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}">
            <i data-lucide="${item.icon}" class="w-4 h-4"></i>
            <span class="flex-1 text-left">${item.label}</span>
        </button>
    </div>`;
};

window.toggleSidebar = (show) => {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (!sidebar) return;

    if (show === undefined) show = sidebar.classList.contains('-translate-x-full');

    if (show) {
        sidebar.classList.remove('-translate-x-full');
        if (backdrop) {
            backdrop.classList.remove('hidden', 'pointer-events-none');
            setTimeout(() => backdrop.classList.add('opacity-100'), 10);
        }
    } else {
        sidebar.classList.add('-translate-x-full');
        if (backdrop) {
            backdrop.classList.remove('opacity-100');
            setTimeout(() => {
                backdrop.classList.add('hidden', 'pointer-events-none');
            }, 300);
        }
    }
};

window.renderSidebar = (activePage) => {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    
    // Manage Backdrop for Mobile
    if (!document.getElementById('sidebar-backdrop')) {
        const bd = document.createElement('div');
        bd.id = 'sidebar-backdrop';
        bd.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[45] hidden transition-opacity duration-300 opacity-0 pointer-events-none md:hidden";
        bd.onclick = () => window.toggleSidebar(false);
        document.body.appendChild(bd);
    }
    
    sidebar.innerHTML = `
        <div class="p-6 h-full flex flex-col">
            <!-- Brand & Mobile Close -->
            <div class="flex items-center justify-between mb-10 px-2 cursor-pointer">
                <div class="flex items-center gap-3" onclick="location.href='index.html'">
                    <div class="bg-indigo-600 p-2 rounded-lg">
                        <i data-lucide="flower-2" class="text-white w-6 h-6"></i>
                    </div>
                    <div>
                        <h1 class="font-black text-white text-lg tracking-tighter uppercase">Lavish Lavender</h1>
                        <div class="flex items-center gap-2 mt-1">
                            <p class="text-[9px] text-slate-500 font-black uppercase tracking-widest leading-none">Management Suite</p>
                            <span class="text-[8px] font-black text-slate-600">${window.APP_VERSION}</span>
                        </div>
                    </div>
                </div>
                <button onclick="window.toggleSidebar(false);" class="p-2 md:hidden text-slate-400 hover:text-white transition-colors bg-white/5 rounded-lg active:scale-95">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
            </div>

            <!-- Navigation -->
            <nav id="sidebar-nav" class="space-y-2 flex-1 scrollbar-hide overflow-y-auto">
                ${window.erpState.menuItems
                    .filter(item => !item.roles || item.roles.includes(window.erpState.role))
                    .map(item => window.navBtn(item)).join('')}
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

// Safari/Mobile BFCache unloader - force closes menu on navigating back
window.addEventListener('pageshow', (e) => {
    if (e.persisted && document.getElementById('sidebar')?.classList.contains('md:translate-x-0') === false) {
        window.toggleSidebar(false);
    }
});

let _renderScheduled = false;
window.scheduleRender = () => {
    if (_renderScheduled) return;
    _renderScheduled = true;
    requestAnimationFrame(() => {
        _renderScheduled = false;
        if (window.renderApp) window.renderApp();
    });
};

window.erpPrompt = (msg, defaultVal = '', title = 'Input Required') => {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = "fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[10000] p-4";
        modal.innerHTML = `
            <div class="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl animate-pop-in border border-slate-100 text-center relative overflow-hidden">
                <div class="absolute -right-6 -top-6 w-32 h-32 bg-violet-50 rounded-full blur-3xl"></div>
                <div class="w-16 h-16 bg-violet-50 text-violet-600 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-violet-100 relative">
                    <i data-lucide="text-cursor-input" class="w-8 h-8"></i>
                </div>
                <h3 class="text-xl font-black text-slate-900 mb-2 uppercase tracking-tighter">${window.esc(title)}</h3>
                <p class="text-xs font-bold text-slate-400 uppercase tracking-widest leading-relaxed mb-6 px-4">${window.esc(msg)}</p>
                <input id="erp_prompt_input" type="text" value="${String(defaultVal).replace(/"/g, '&quot;')}"
                    class="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-base outline-none focus:border-violet-500 transition-all mb-6 text-center">
                <div class="flex gap-3">
                    <button id="erp_prompt_cancel" class="flex-1 py-5 bg-slate-100 text-slate-500 rounded-[24px] font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all">Cancel</button>
                    <button id="erp_prompt_ok" class="flex-1 py-5 bg-violet-600 text-white rounded-[24px] font-black uppercase text-[10px] tracking-widest shadow-xl shadow-violet-100 active:scale-95 transition-all">Confirm</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        if (window.lucide) lucide.createIcons();
        const input = document.getElementById('erp_prompt_input');
        input.focus();
        input.select();
        document.getElementById('erp_prompt_cancel').onclick = () => { modal.remove(); resolve(null); };
        document.getElementById('erp_prompt_ok').onclick = () => { modal.remove(); resolve(input.value); };
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { modal.remove(); resolve(input.value); } });
    });
};

let _snapshotDirty = false;
window.batchedRender = () => {
    if (_snapshotDirty) return;
    _snapshotDirty = true;
    setTimeout(() => {
        _snapshotDirty = false;
        window.scheduleRender();
    }, 300);
};
// UNIVERSAL THERMAL PRINT ENGINE
window.generateThermalPrint = function(data) {
    const pConf = window.erpState.printerConfig || { 
        width: '58', logo: '', header: 'Lavish Lavender', subTitle: 'Bridal Boutique', 
        address: 'MAK building, Near Uppala Bustand, Uppala, Kasargod', 
        phone: '+91 75580 08881', website: 'www.lavishlavender.in',
        showCustomer: true, showStaff: true, showTax: true,
        note: '*** IMPORTANT CARE NOTES ***\nNo Returns | No Exchange | Dry Wash Only',
        footer1: 'Thank you for Purchase', footer2: 'Visit Again!', footer3: '',
        extraFields: []
    };
    
    const paperWidth = pConf.width === '80' ? '80mm' : '58mm';
    const fmt = (v) => '₹' + (v || 0).toLocaleString('en-IN');
    
    const dateObj = new Date(data.date || Date.now());
    const dateStr = dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

    const w = window.open('', '_blank', `width=${pConf.width == '80' ? '450' : '350'},height=600`);
    if (!w) return window.erpAlert("Popup blocked. Please allow popups for printing.", "Popup Blocked", "external-link");

    let html = `<html><body style='font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;width:${paperWidth};font-size:11px;margin:0;padding:5px 12px;line-height:1.4;color:#111;'>`;

    // Logo
    if (pConf.logo) {
        html += `<div style='text-align:center;margin-bottom:8px;'><img src='${pConf.logo}' style='width:35mm;filter:grayscale(1) contrast(1.2);'></div>`;
    }

    // Header Section
    html += `<div style='text-align:center;font-weight:900;font-size:16px;letter-spacing:-0.5px;'>${window.esc(pConf.header.toUpperCase())}</div>`;
    if (pConf.subTitle) html += `<div style='text-align:center;font-size:10px;font-weight:700;margin-bottom:2px;color:#444;'>${window.esc(pConf.subTitle)}</div>`;
    
    (pConf.address || "").split(',').forEach(line => {
        html += `<div style='text-align:center;font-size:9px;color:#666;'>${window.esc(line.trim())}</div>`;
    });
    
    // Website and Mobile in one line with better spacing
    html += `<div style='text-align:center;font-size:9px;font-weight:bold;margin-top:2px;'>`;
    html += `<span>${window.esc(pConf.phone)}</span>`;
    if (pConf.website) html += `<span style='margin:0 8px;color:#eee;'>|</span><span style='color:#666;'>${window.esc(pConf.website)}</span>`;
    html += `</div>`;

    // Extra Top Fields
    if (pConf.extraFields) {
        pConf.extraFields.filter(f => f.position === 'top').forEach(f => {
            html += `<div style='text-align:center;font-size:9px;font-weight:black;margin-top:2px;text-transform:uppercase;'>${window.esc(f.label)}: ${window.esc(f.value)}</div>`;
        });
    }

    html += `<hr style='border:none;border-top:1px dashed #ccc;margin:8px 0;'>`;

    // Meta Section
    html += `<div style='display:flex;justify-content:space-between;font-weight:bold;margin-bottom:2px;'><span>№ ${window.esc(data.billNo)}</span><span>${window.esc(dateStr)}</span></div>`;
    html += `<div style='display:flex;justify-content:space-between;color:#666;'><span>Staff: ${window.esc(data.recordedBy || 'Admin')}</span><span>${window.esc(timeStr)}</span></div>`;
    
    if (pConf.showCustomer && (data.customerName || data.customerPhone)) {
        html += `<div style='margin-top:4px;border-left:2px solid #eee;padding-left:6px;'>`;
        if (data.customerName) html += `<div style='font-weight:bold;font-size:10px;'>${window.esc(data.customerName.toUpperCase())}</div>`;
        if (data.customerPhone) html += `<div style='font-size:10px;'>${window.esc(data.customerPhone)}</div>`;
        html += `</div>`;
    }

    // Tailoring References
    if (data.tailoringRefs && data.tailoringRefs.length > 0) {
        html += `<div style='font-weight:bold;margin-top:4px;font-size:10px;'>Jobs: ${window.esc(data.tailoringRefs.join(', '))}</div>`;
    }

    html += `<hr style='border:none;border-top:1px dashed #ccc;margin:8px 0;'>`;

    // Items
    html += `<table style='width:100%;font-size:11px;text-align:left;border-collapse:collapse;table-layout:fixed;'>`;
    html += `<tr style='font-weight:900;text-transform:uppercase;font-size:9px;color:#666;'><td style='padding-bottom:4px;width:55%;'>Item Description</td><td style='text-align:center;width:15%;'>Qty</td><td style='text-align:right;width:30%;'>Amt</td></tr>`;

    (data.items || []).forEach(i => {
        html += `<tr><td style='padding:4px 0;' colspan='3'><div style='font-weight:bold;'>${window.esc(i.name)}</div>`;
        if (i.tailoringRef) html += `<div style='font-size:9px;color:#666;'>Job: ${window.esc(i.tailoringRef)}</div>`;
        html += `</td></tr>`;
        html += `<tr style='font-size:10px;color:#444;'><td style='padding-bottom:6px;'>@ ${fmt(i.price)}</td><td style='text-align:center;padding-bottom:6px;'>${i.qty}</td><td style='text-align:right;padding-bottom:6px;'>${fmt(i.qty * i.price)}</td></tr>`;
    });
    html += `</table>`;
    html += `<table style="width:100%;font-size:11px;border-collapse:collapse;">`;
    const printRow = (l, v, b = false, c = '#111', sz = '11px') =>
        `<tr style="color:${c};font-size:${sz};${b ? 'font-weight:900;' : ''}"><td style="padding:2px 0;">${l}</td><td style="text-align:right;padding:2px 0;">${v}</td></tr>`;

    html += printRow("SUBTOTAL", fmt(data.subtotal));
    if (data.discount > 0) html += printRow("DISCOUNT", "- " + fmt(data.discount), false, "#dc2626");
    if (data.redeemAmt > 0) html += printRow("REDEMPTION", "- " + fmt(data.redeemAmt), false, "#dc2626");
    
    if (pConf.showTax && (data.taxVal > 0)) {
        const base = (data.subtotal || 0) - (data.discount || 0) - (data.redeemAmt || 0);
        const taxAmt = base * (data.taxVal / 100);
        html += printRow("TAX (" + data.taxVal + "%)", fmt(Math.round(taxAmt)));
    }
    
    html += `<tr><td colspan="2"><hr style='border:none;border-top:1px dashed #ccc;margin:4px 0;'></td></tr>`;
    html += printRow("NET AMOUNT", fmt(data.total), true, '#111', '14px');
    html += printRow("PAID AMOUNT", fmt(data.paid), false, '#666', '12px');
    if (data.balance > 0) html += printRow("BALANCE DUE", fmt(data.balance), true, "#000", '14px');

    html += `</table>`;

    html += `<hr style='border:none;border-top:1px dashed #ccc;margin:8px 0;'>`;

    // Loyalty
    if (data.loyaltySnapshot) {
        const ls = data.loyaltySnapshot;
        html += `<div style='margin-top:4px;border:1px dashed #ccc;padding:4px;text-align:center;'>`;
        html += `<div style='font-weight:900;font-size:9px;text-transform:uppercase;'>Loyalty Snapshot</div>`;
        html += `<div style='font-size:11px;font-weight:bold;'>${(ls.tier || 'Basic').toUpperCase()} MEMBER</div>`;
        html += `<div style='font-size:10px;'>Earned: ${ls.earned} | Balance: ${ls.total} pts</div>`;
        html += `</div>`;
        html += `<hr style='border:none;border-top:1px dashed #ccc;margin:8px 0;'>`;
    }

    // Care Note
    if (pConf.note) {
        pConf.note.split('\n').forEach(line => {
            if (line.trim()) html += `<div style='text-align:center;font-size:9px;font-weight:bold;margin-bottom:2px;text-transform:uppercase;'>${window.esc(line.trim())}</div>`;
        });
        html += `<hr style='border:none;border-top:1px dashed #ccc;margin:8px 0;'>`;
    }

    // Footer
    html += `<div style='text-align:center;font-size:11px;font-weight:bold;text-transform:uppercase;'>${window.esc(pConf.footer1 || 'Thank you!')}</div>`;
    if (pConf.footer2) html += `<div style='text-align:center;font-size:10px;margin-top:2px;'>${window.esc(pConf.footer2)}</div>`;
    if (pConf.footer3) html += `<div style='text-align:center;font-size:10px;margin-top:2px;'>${window.esc(pConf.footer3)}</div>`;

    // Extra Bottom Fields
    if (pConf.extraFields) {
        pConf.extraFields.filter(f => f.position === 'bottom').forEach(f => {
            html += `<div style='text-align:center;font-size:10px;font-weight:black;margin-top:4px;text-transform:uppercase;'>${window.esc(f.label)}: ${window.esc(f.value)}</div>`;
        });
    }

    if (window.erpState.gstin) {
        html += `<div style='text-align:center;font-size:9px;color:#000;margin-top:8px;font-weight:bold;'>GSTIN: ${window.erpState.gstin}</div>`;
    }

    html += `<div style='text-align:center;margin-top:15px;color:#aaa;font-size:9px;letter-spacing:1px;font-weight:bold;'>* * * CLOUD INVOICE * * *</div>`;
    html += `</body></html>`;

    const style = `<style>
        @page { margin: 0; size: ${paperWidth} auto; }
        body { 
            margin: 0; 
            padding: 0; 
            width: ${paperWidth}; 
            height: auto !important;
            overflow: hidden;
            font-family: monospace;
        }
        * { -webkit-print-color-adjust: exact; box-sizing: border-box; }
        @media print { 
            body { width: ${paperWidth}; } 
            .no-print { display: none; }
        }
    </style>`;

    w.document.write(style + html);
    w.document.close();
    w.focus();
    setTimeout(() => {
        w.print();
        setTimeout(() => { w.close(); }, 800);
    }, 800);
};
