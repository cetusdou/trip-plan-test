/**
 * 行后复盘应用主控制器
 * 负责初始化和协调行后复盘模块的所有子模块
 */
class PostTripApp {
    constructor() {
        this.messageBoard = null;
        this.photoGallery = null;
        this.expenseSplitter = null;
    }

    /**
     * 初始化行后复盘应用
     */
    init() {
        console.log('[PostTripApp] 初始化行后复盘应用...');

        // 行后数据按「当前行程」隔离（照片/分账/留言各行程独立）
        if (window.moduleStore && window.moduleStore.setScoped) {
            window.moduleStore.setScoped(true);
        }

        // 初始化留言板管理器
        const messageBoardContainer = document.getElementById('message-board-container');
        if (messageBoardContainer && typeof PostTripMessageBoard !== 'undefined') {
            this.messageBoard = new PostTripMessageBoard();
            this.messageBoard.init(messageBoardContainer);
            console.log('[PostTripApp] 留言板管理器初始化完成');
        }

        // 初始化照片画廊管理器
        const photoGalleryContainer = document.getElementById('photo-gallery-container');
        if (photoGalleryContainer && typeof PhotoGallery !== 'undefined') {
            this.photoGallery = new PhotoGallery();
            this.photoGallery.init(photoGalleryContainer);
            console.log('[PostTripApp] 照片画廊管理器初始化完成');
        }

        // 初始化分账管理器
        const expenseSplitterContainer = document.getElementById('expense-splitter-container');
        if (expenseSplitterContainer && typeof ExpenseSplitter !== 'undefined') {
            this.expenseSplitter = new ExpenseSplitter();
            this.expenseSplitter.init(expenseSplitterContainer);
            console.log('[PostTripApp] 分账管理器初始化完成');
        }

        // 绑定导航事件
        this.attachNavigationEvents();

        console.log('[PostTripApp] 行后复盘应用初始化完成');
    }

    /**
     * 绑定导航事件
     */
    attachNavigationEvents() {
        // 行前准备导航按钮
        const preDepartureBtn = document.getElementById('nav-pre-departure');
        if (preDepartureBtn) {
            preDepartureBtn.addEventListener('click', () => {
                console.log('[PostTripApp] 导航到行前准备');
                window.location.href = 'pre-departure.html';
            });
        }

        // 行程规划导航按钮
        const itineraryBtn = document.getElementById('nav-itinerary');
        if (itineraryBtn) {
            itineraryBtn.addEventListener('click', () => {
                console.log('[PostTripApp] 导航到行程规划');
                window.location.href = 'itinerary-planning.html';
            });
        }

        // 行后复盘导航按钮
        const postTripBtn = document.getElementById('nav-post-trip');
        if (postTripBtn) {
            postTripBtn.addEventListener('click', () => {
                console.log('[PostTripApp] 导航到行后复盘');
                // 行后复盘已经是当前页面，不需要导航
            });
        }
    }

    /**
     * 销毁行后复盘应用
     */
    destroy() {
        console.log('[PostTripApp] 销毁行后复盘应用...');
        // 清理资源
        this.messageBoard = null;
        this.photoGallery = null;
        this.expenseSplitter = null;
    }
}

// 登录成功后初始化应用（确保 Firestore 订阅在通过鉴权后才建立）
function startPostTripApp() {
    if (!window.postTripApp) window.postTripApp = new PostTripApp();
    window.postTripApp.init();
}
if (typeof window !== 'undefined') {
    window.onLoginSuccess = startPostTripApp;
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PostTripApp;
} else if (typeof window !== 'undefined') {
    window.PostTripApp = PostTripApp;
}