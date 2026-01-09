// Cloudinary 图片上传服务模块

const CLOUDINARY_CONFIG = {
    cloudName: 'deesradkv',
    uploadPreset: 'test-trip-plan',
    apiKey: ''
};

class CloudinaryUploadService {
    constructor(config) {
        this.cloudName = config.cloudName;
        this.uploadPreset = config.uploadPreset;
        this.apiKey = config.apiKey;
    }
    
    isConfigured() {
        return !!(this.cloudName && this.uploadPreset);
    }
    
    async uploadImage(file) {
        if (!this.isConfigured()) {
            throw new Error('Cloudinary 未配置，请先设置 cloudName 和 uploadPreset');
        }
        
        const compressedFile = await this.compressImageFile(file);
        
        const formData = new FormData();
        formData.append('file', compressedFile);
        formData.append('upload_preset', this.uploadPreset);
        formData.append('cloud_name', this.cloudName);
        
        const publicId = `trip_plan/${Date.now()}_${Math.random().toString(36).substring(7)}`;
        formData.append('public_id', publicId);
        
        try {
            const response = await fetch(`https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`, {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || '上传失败');
            }
            
            const result = await response.json();
            const optimizedUrl = result.secure_url.replace('/upload/', '/upload/q_auto,f_auto/');
            
            return {
                url: optimizedUrl,
                publicId: result.public_id,
                originalUrl: result.secure_url
            };
        } catch (error) {
            console.error('Cloudinary 上传失败:', error);
            throw new Error(`图片上传失败: ${error.message}`);
        }
    }
    
    async compressImageFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (event) => {
                const img = new Image();
                
                img.onload = () => {
                    const MAX_WIDTH = 1920;
                    const MAX_HEIGHT = 1080;
                    let width = img.width;
                    let height = img.height;
                    
                    if (width > MAX_WIDTH || height > MAX_HEIGHT) {
                        const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
                        width = Math.floor(width * ratio);
                        height = Math.floor(height * ratio);
                    }
                    
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    canvas.toBlob((blob) => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error('图片压缩失败'));
                        }
                    }, 'image/jpeg', 0.8);
                };
                
                img.onerror = () => {
                    reject(new Error('无法加载图片'));
                };
                
                img.src = event.target.result;
            };
            
            reader.onerror = () => {
                reject(new Error('无法读取文件'));
            };
            
            reader.readAsDataURL(file);
        });
    }
    
    async deleteImage(publicId) {
        if (!this.isConfigured()) {
            throw new Error('Cloudinary 未配置');
        }
        
        console.warn('图片删除功能需要配置签名或使用服务器端 API');
        return { success: true, message: '图片已标记删除（需要在服务器端实际删除）' };
    }
}

const cloudinaryService = new CloudinaryUploadService(CLOUDINARY_CONFIG);

