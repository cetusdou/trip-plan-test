// Firebase 初始化（Firestore + Auth）
// 以 ES Module 方式加载：<script type="module" src="modules/storage/firebase-init.js"></script>
// 初始化完成后，将常用实例与 SDK 函数挂到 window.fb，并派发 'firebaseReady' 事件。
// 经典脚本（firestore-store.js / auth-manager.js）通过 window.fb 调用，无需各自再 import。

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import {
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    deleteField,
    onSnapshot,
    serverTimestamp,
    writeBatch
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyD1ibXnpROs_28gzzfBIPzvwvNYj13gSOM",
    authDomain: "trip-plan-cetus.firebaseapp.com",
    databaseURL: "https://trip-plan-cetus-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "trip-plan-cetus",
    storageBucket: "trip-plan-cetus.firebasestorage.app",
    messagingSenderId: "593052021342",
    appId: "1:593052021342:web:951da391daaed3a0f67acf",
    measurementId: "G-WVNF8DL6QD"
};

const app = initializeApp(firebaseConfig);

// 启用离线持久化缓存（替代原先大量的 localStorage 手动缓存逻辑）
let db;
try {
    db = initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });
} catch (e) {
    // 某些环境（如隐私模式/多实例）持久化不可用时，退回默认内存缓存
    const { getFirestore } = await import("https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js");
    db = getFirestore(app);
}

const auth = getAuth(app);

// 暴露到全局，供经典脚本使用
window.fb = {
    app,
    db,
    auth,
    config: firebaseConfig,
    // Firestore API
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    deleteField,
    onSnapshot,
    serverTimestamp,
    writeBatch,
    // Auth API
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut
};

// 向后兼容旧 app-initializer / 模块中对这些全局的存在性检查
window.firebaseLoaded = true;
window.firebaseDatabase = db;        // 仅用于真值判断（旧代码 if (window.firebaseDatabase)）
window.firebaseConfig = firebaseConfig;
window.firebaseReadyFlag = true;
window.dispatchEvent(new CustomEvent('firebaseReady'));
