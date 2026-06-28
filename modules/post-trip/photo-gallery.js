/**
 * 共享照片管理器
 * 负责管理共享照片数据和UI渲染
 */
class PhotoGallery {
    constructor() {
        this.photos = {};
        this.container = null;
    }

    /**
     * 初始化照片管理器
     * @param {HTMLElement} container - 照片容器
     */
    init(container) {
        this.container = container;
        this.loadData();
        this.render();
    }

    /**
     * 加载照片数据
     */
    loadData() {
        // 从 stateManager 或 localStorage 加载数据
        if (typeof window !== 'undefined' && window.stateManager) {
            const state = window.stateManager.getState('postTrip');
            if (state && state.photos) {
                this.photos = state.photos;
            }
        }
    }

    /**
     * 保存照片数据
     */
    saveData() {
        // 保存到 stateManager 和 localStorage
        if (typeof window !== 'undefined' && window.stateManager) {
            window.stateManager.setState({
                postTrip: {
                    ...window.stateManager.getState('postTrip'),
                    photos: this.photos
                }
            });
        }
    }

    /**
     * 添加照片
     * @param {Object} photo - 照片
     */
    addPhoto(photo) {
        const photoId = Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9);
        this.photos[photoId] = {
            id: photoId,
            ...photo,
            _createdAt: new Date().toISOString(),
            _updatedAt: new Date().toISOString(),
            likes: []
        };
        this.saveData();
        this.render();
    }

    /**
     * 更新照片
     * @param {string} photoId - 照片ID
     * @param {Object} updates - 更新内容
     */
    updatePhoto(photoId, updates) {
        if (this.photos[photoId]) {
            this.photos[photoId] = {
                ...this.photos[photoId],
                ...updates,
                _updatedAt: new Date().toISOString()
            };
            this.saveData();
            this.render();
        }
    }

    /**
     * 删除照片
     * @param {string} photoId - 照片ID
     */
    deletePhoto(photoId) {
        if (this.photos[photoId]) {
            delete this.photos[photoId];
            this.saveData();
            this.render();
        }
    }

    /**
     * 点赞照片
     * @param {string} photoId - 照片ID
     * @param {string} user - 点赞用户
     */
    toggleLike(photoId, user) {
        if (this.photos[photoId]) {
            const likes = this.photos[photoId].likes || [];
            const userIndex = likes.indexOf(user);
            if (userIndex > -1) {
                likes.splice(userIndex, 1);
            } else {
                likes.push(user);
            }
            this.photos[photoId].likes = likes;
            this.saveData();
            this.render();
        }
    }

    /**
     * 渲染照片画廊
     */
    render() {
        if (!this.container) return;

        // 将对象转换为数组并按时间排序
        const photosArray = Object.values(this.photos).sort((a, b) => {
            return new Date(b._createdAt) - new Date(a._createdAt);
        });

        if (photosArray.length === 0) {
            this.container.innerHTML = `
                <div class="photo-gallery-empty">
                    <p>暂无照片</p>
                    <button id="upload-photo-btn" class="btn-primary">上传照片</button>
                    <input type="file" id="photo-file-input" accept="image/*" style="display: none;">
                </div>
            `;
            this.attachEvents();
            return;
        }

        let html = '<div class="photo-gallery">';
        photosArray.forEach((photo, index) => {
            html += this.createPhotoHTML(photo, index);
        });
        html += '</div>';

        // 添加上传按钮
        html += `
            <div class="photo-upload-section">
                <button id="upload-photo-btn" class="btn-primary">上传照片</button>
                <input type="file" id="photo-file-input" accept="image/*" style="display: none;">
            </div>
        `;

        this.container.innerHTML = html;
        this.attachEvents();
    }

    /**
     * 创建照片HTML
     * @param {Object} photo - 照片
     * @param {number} index - 索引
     * @returns {string} HTML字符串
     */
    createPhotoHTML(photo, index) {
        return `
            <div class="photo-item" data-photo-id="${photo.id}">
                <div class="photo-image-container">
                    <img src="${photo.url || 'placeholder.jpg'}" alt="${photo.caption || '照片'}" class="photo-image">
                </div>
                <div class="photo-info">
                    <div class="photo-header">
                        <span class="photo-uploader">${photo.uploader || '匿名用户'}</span>
                        <span class="photo-date">${new Date(photo._createdAt).toLocaleString()}</span>
                    </div>
                    ${photo.caption ? `<div class="photo-caption">${photo.caption}</div>` : ''}
                    ${photo.location ? `<div class="photo-location">📍 ${photo.location}</div>` : ''}
                </div>
                <div class="photo-actions">
                    <button class="btn-secondary like-photo-btn" data-photo-id="${photo.id}">
                        ❤️ ${photo.likes ? photo.likes.length : 0}
                    </button>
                    <button class="btn-secondary edit-photo-btn" data-photo-id="${photo.id}">编辑</button>
                    <button class="btn-danger delete-photo-btn" data-photo-id="${photo.id}">删除</button>
                </div>
            </div>
        `;
    }

    /**
     * 绑定事件
     */
    attachEvents() {
        // 上传照片按钮事件
        const uploadBtn = this.container.querySelector('#upload-photo-btn');
        const fileInput = this.container.querySelector('#photo-file-input');
        if (uploadBtn && fileInput) {
            uploadBtn.addEventListener('click', () => {
                fileInput.click();
            });

            fileInput.addEventListener('change', (e) => {
                this.handlePhotoUpload(e);
            });
        }

        // 点赞按钮事件
        const likeBtns = this.container.querySelectorAll('.like-photo-btn');
        likeBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const photoId = e.target.dataset.photoId;
                const currentUser = typeof localStorage !== 'undefined' ? localStorage.getItem('trip_current_user') || 'anonymous' : 'anonymous';
                this.toggleLike(photoId, currentUser);
            });
        });

        // 编辑按钮事件
        const editBtns = this.container.querySelectorAll('.edit-photo-btn');
        editBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const photoId = e.target.dataset.photoId;
                this.showEditPhotoModal(photoId);
            });
        });

        // 删除按钮事件
        const deleteBtns = this.container.querySelectorAll('.delete-photo-btn');
        deleteBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const photoId = e.target.dataset.photoId;
                if (confirm('确定要删除这张照片吗？')) {
                    this.deletePhoto(photoId);
                }
            });
        });
    }

    /**
     * 处理照片上传
     * @param {Event} e - 文件上传事件
     */
    handlePhotoUpload(e) {
        const file = e.target.files[0];
        if (file) {
            // 检查文件类型
            if (!file.type.startsWith('image/')) {
                alert('请选择图片文件');
                return;
            }

            // 检查文件大小（限制为10MB）
            if (file.size > 10 * 1024 * 1024) {
                alert('文件大小不能超过10MB');
                return;
            }

            // 使用 Cloudinary 上传（如果可用）
            if (typeof cloudinary !== 'undefined' && cloudinary.uploader) {
                this.uploadToCloudinary(file);
            } else {
                // 降级方案：使用 FileReader 读取本地文件
                this.readLocalFile(file);
            }
        }
    }

    /**
     * 上传到 Cloudinary
     * @param {File} file - 图片文件
     */
    uploadToCloudinary(file) {
        const currentUser = typeof localStorage !== 'undefined' ? localStorage.getItem('trip_current_user') || 'anonymous' : 'anonymous';

        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', 'trip_plan_preset');

        fetch('https://api.cloudinary.com/v1_1/your-cloud-name/image/upload', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.secure_url) {
                this.addPhoto({
                    url: data.secure_url,
                    uploader: currentUser,
                    caption: '',
                    location: ''
                });
            }
        })
        .catch(error => {
            console.error('上传失败:', error);
            alert('上传失败，请重试');
        });
    }

    /**
     * 读取本地文件（降级方案）
     * @param {File} file - 图片文件
     */
    readLocalFile(file) {
        const reader = new FileReader();
        const currentUser = typeof localStorage !== 'undefined' ? localStorage.getItem('trip_current_user') || 'anonymous' : 'anonymous';

        reader.onload = (e) => {
            this.addPhoto({
                url: e.target.result,
                uploader: currentUser,
                caption: '',
                location: ''
            });
        };

        reader.readAsDataURL(file);
    }

    /**
     * 显示编辑照片模态框
     * @param {string} photoId - 照片ID
     */
    showEditPhotoModal(photoId) {
        // 模态框功能开发中
        alert('编辑照片功能开发中...');
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PhotoGallery;
} else if (typeof window !== 'undefined') {
    window.PhotoGallery = PhotoGallery;
}