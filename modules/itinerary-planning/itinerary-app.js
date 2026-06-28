/**
 * 行程规划应用主控制器
 * 负责初始化和协调行程规划模块的所有子模块
 */
class ItineraryApp {
    constructor() {
        this.cardSlider = null;
        this.dataManager = null;
        this.likeHandler = null;
    }

    /**
     * 初始化行程规划应用
     */
    init() {
        console.log('[ItineraryApp] 初始化行程规划应用...');

        // 初始化数据管理器
        if (typeof DataManager !== 'undefined') {
            this.dataManager = new DataManager();
            this.dataManager.init();
            console.log('[ItineraryApp] 数据管理器初始化完成');
        }

        // 初始化点赞处理器
        if (typeof LikeHandler !== 'undefined') {
            this.likeHandler = LikeHandler;
            console.log('[ItineraryApp] 点赞处理器初始化完成');
        }

        // 初始化卡片滑块
        const cardsContainer = document.getElementById('cards-container');
        if (cardsContainer && typeof CardSlider !== 'undefined') {
            this.cardSlider = new CardSlider(cardsContainer, 'day1');
            this.cardSlider.init();
            console.log('[ItineraryApp] 卡片滑块初始化完成');
        }

        // 绑定导航事件
        this.attachNavigationEvents();

        console.log('[ItineraryApp] 行程规划应用初始化完成');
    }

    /**
     * 绑定导航事件
     */
    attachNavigationEvents() {
        // 行前准备导航按钮
        const preDepartureBtn = document.getElementById('nav-pre-departure');
        if (preDepartureBtn) {
            preDepartureBtn.addEventListener('click', () => {
                console.log('[ItineraryApp] 导航到行前准备');
                window.location.href = 'pre-departure.html';
            });
        }

        // 行程规划导航按钮
        const itineraryBtn = document.getElementById('nav-itinerary');
        if (itineraryBtn) {
            itineraryBtn.addEventListener('click', () => {
                console.log('[ItineraryApp] 导航到行程规划');
                // 行程规划已经是当前页面，不需要导航
            });
        }

        // 行后复盘导航按钮
        const postTripBtn = document.getElementById('nav-post-trip');
        if (postTripBtn) {
            postTripBtn.addEventListener('click', () => {
                console.log('[ItineraryApp] 导航到行后复盘');
                window.location.href = 'post-trip.html';
            });
        }
    }

    /**
     * 销毁行程规划应用
     */
    destroy() {
        console.log('[ItineraryApp] 销毁行程规划应用...');
        // 清理资源
        this.cardSlider = null;
        this.dataManager = null;
        this.likeHandler = null;
    }
}

// 当DOM加载完成后初始化应用
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        window.itineraryApp = new ItineraryApp();
        window.itineraryApp.init();
    });
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ItineraryApp;
} else if (typeof window !== 'undefined') {
    window.ItineraryApp = ItineraryApp;
}