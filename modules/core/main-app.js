/**
 * 主应用控制器
 * 负责初始化和协调主入口页面的所有功能
 */
class MainApp {
    constructor() {
        this.moduleCards = null;
        this.enterButtons = null;
    }

    /**
     * 初始化主应用
     */
    init() {
        console.log('[MainApp] 初始化主应用...');

        // 获取模块卡片
        this.moduleCards = document.querySelectorAll('.module-card');
        this.enterButtons = document.querySelectorAll('.enter-btn');

        // 绑定事件
        this.attachEvents();

        console.log('[MainApp] 主应用初始化完成');
    }

    /**
     * 绑定事件
     */
    attachEvents() {
        // 为每个模块卡片的进入按钮绑定事件
        this.enterButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                const moduleCard = button.closest('.module-card');
                if (moduleCard) {
                    const moduleId = moduleCard.id;
                    this.navigateToModule(moduleId);
                }
            });
        });

        // 为模块卡片添加点击事件（点击卡片任何位置都可以进入）
        this.moduleCards.forEach(card => {
            card.addEventListener('click', () => {
                const moduleId = card.id;
                this.navigateToModule(moduleId);
            });
        });

        // 为按钮添加阻止冒泡（防止触发卡片点击事件）
        this.enterButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        });
    }

    /**
     * 导航到指定模块
     * @param {string} moduleId - 模块ID
     */
    navigateToModule(moduleId) {
        console.log(`[MainApp] 导航到模块: ${moduleId}`);

        switch (moduleId) {
            case 'module-pre-departure':
                window.location.href = 'pre-departure.html';
                break;
            case 'module-itinerary':
                window.location.href = 'itinerary-planning.html';
                break;
            case 'module-post-trip':
                window.location.href = 'post-trip.html';
                break;
            default:
                console.error(`[MainApp] 未知模块: ${moduleId}`);
                alert('未知模块，请重试');
        }
    }

    /**
     * 销毁主应用
     */
    destroy() {
        console.log('[MainApp] 销毁主应用...');
        // 清理资源
        this.moduleCards = null;
        this.enterButtons = null;
    }
}

// 当DOM加载完成后初始化应用
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        window.mainApp = new MainApp();
        window.mainApp.init();
    });
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MainApp;
} else if (typeof window !== 'undefined') {
    window.MainApp = MainApp;
}