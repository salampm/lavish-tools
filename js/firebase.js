// Firebase Configuration & Initialization (Local File Compatible)
(function() {
    const config = {
        apiKey: "AIzaSyAvBgfCOf3-apZUTWrcwhe-ZY3XEhxOXcw",
        authDomain: "tailoring-app-d9855.firebaseapp.com",
        projectId: "tailoring-app-d9855",
        storageBucket: "tailoring-app-d9855.firebasestorage.app",
        messagingSenderId: "621310602868",
        appId: "1:621310602868:web:7f7d07614a542181d1ab21"
    };

    // Load Firebase Compat scripts dynamically for maximum compatibility
    const scripts = [
        "https://www.gstatic.com/firebasejs/11.0.2/firebase-app-compat.js",
        "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore-compat.js",
        "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth-compat.js"
    ];

    let loadedCount = 0;
    scripts.forEach(src => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => {
            loadedCount++;
            if (loadedCount === scripts.length) {
                initFirebase();
            }
        };
        document.head.appendChild(script);
    });

    function initFirebase() {
        firebase.initializeApp(config);
        const db = firebase.firestore();
        
        // Enable Offline Persistence
        db.enablePersistence({ synchronizeTabs: true }).catch(err => {
            console.warn("Persistence failed:", err.code);
        });

        const APP_ID = 'lavish-lavender-erp';
        
        window.FB = {
            db: db,
            auth: firebase.auth(),
            collection: (n) => db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(n),
            root: (n) => db.collection(n),
            Timestamp: firebase.firestore.Timestamp
        };

        window.dispatchEvent(new Event('firebase-ready'));
        console.log("Firebase initialized successfully (Compat Mode)");
    }
})();
