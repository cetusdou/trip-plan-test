/**
 * 行前准备应用主控制器
 * 负责初始化和协调行前准备模块的所有子模块
 */
class PreDepartureApp {
    constructor() {
        this.sharedCalendar = null;
        this.messageBoard = null;
    }

    /**
     * 初始化行前准备应用
     */
    init() {
        console.log('[PreDepartureApp] 初始化行前准备应用...');

        // 初始化共享日历管理器
        const calendarContainer = document.getElementById('calendar-container');
        if (calendarContainer && typeof SharedCalendar !== 'undefined') {
            this.sharedCalendar = new SharedCalendar();
            this.sharedCalendar.init(calendarContainer);
            console.log('[PreDepartureApp] 共享日历管理器初始化完成');
        }

        // 初始化留言板管理器
        const messageBoardContainer = document.getElementById('message-board-container');
        if (messageBoardContainer && typeof MessageBoard !== 'undefined') {
            this.messageBoard = new MessageBoard();
            this.messageBoard.init(messageBoardContainer);
            console.log('[PreDepartureApp] 留言板管理器初始化完成');
        }

        // 绑定导航事件
        this.attachNavigationEvents();

        console.log('[PreDepartureApp] 行前准备应用初始化完成');
    }

    /**
     * 绑定导航事件
     */
    attachNavigationEvents() {
        // 行前准备导航按钮
        const preDepartureBtn = document.getElementById('nav-pre-departure');
        if (preDepartureBtn) {
            preDepartureBtn.addEventListener('click', () => {
                console.log('[PreDepartureApp] 导航到行前准备');
                // 行前准备已经是当前页面，不需要导航
            });
        }

        // 行程规划导航按钮
        const itineraryBtn = document.getElementById('nav-itinerary');
        if (itineraryBtn) {
            itineraryBtn.addEventListener('click', () => {
                console.log('[PreDepartureApp] 导航到行程规划');
                window.location.href = 'itinerary-planning.html';
            });
        }

        // 行后复盘导航按钮
        const postTripBtn = document.getElementById('nav-post-trip');
        if (postTripBtn) {
            postTripBtn.addEventListener('click', () => {
                console.log('[PreDepartureApp] 导航到行后复盘');
                window.location.href = 'post-trip.html';
            });
        }
    }

    /**
     * 销毁行前准备应用
     */
    destroy() {
        console.log('[PreDepartureApp] 销毁行前准备应用...');
        // 清理资源
        this.sharedCalendar = null;
        this.messageBoard = null;
    }
}

// 登录成功后初始化应用（确保 Firestore 订阅在通过鉴权后才建立）
function startPreDepartureApp() {
    if (!window.preDepartureApp) window.preDepartureApp = new PreDepartureApp();
    window.preDepartureApp.init();
}
if (typeof window !== 'undefined') {
    window.onLoginSuccess = startPreDepartureApp;
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PreDepartureApp;
} else if (typeof window !== 'undefined') {
    window.PreDepartureApp = PreDepartureApp;
}