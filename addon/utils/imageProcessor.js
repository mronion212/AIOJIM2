const sharp = require('sharp');
const axios = require('axios');

async function blurImage(imageUrl) {
  try {
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer'
    });

    const processedImageBuffer = await sharp(response.data)
      .blur(20)
      .toBuffer();

    return processedImageBuffer;
  } catch (error) {
    console.error('Erro ao processar imagem:', error);
    return null;
  }
}

/**
 * Convert banner image to full-size background image
 * @param {string} bannerUrl - Original banner image URL
 * @param {Object} options - Processing options
 * @param {number} options.width - Target width (default: 1920)
 * @param {number} options.height - Target height (default: 1080)
 * @param {number} options.blur - Blur amount (default: 0)
 * @param {number} options.brightness - Brightness adjustment (default: 1)
 * @param {number} options.contrast - Contrast adjustment (default: 1)
 * @returns {Promise<Buffer|null>} Processed image buffer
 */
async function convertBannerToBackground(bannerUrl, options = {}) {
  try {
      const {
    width = 1920,
    height = 1080,
    blur = 0,
    brightness = 1,
    contrast = 1,
    position = 'center'
  } = options;

    const response = await axios.get(bannerUrl, {
      responseType: 'arraybuffer'
    });

    let sharpInstance = sharp(response.data);

    // Resize to target dimensions with cover mode (maintains aspect ratio)
    // For banner images, use 'top' position to avoid cutting off important content
    sharpInstance = sharpInstance.resize(width, height, {
      fit: 'cover',
      position: position
    });

    // Apply blur if specified
    if (blur > 0) {
      sharpInstance = sharpInstance.blur(blur);
    }

    // Apply brightness and contrast adjustments
    if (brightness !== 1 || contrast !== 1) {
      sharpInstance = sharpInstance.modulate({
        brightness,
        contrast
      });
    }

    const processedImageBuffer = await sharpInstance.toBuffer();
    return processedImageBuffer;

  } catch (error) {
    console.error('[ImageProcessor] Error converting banner to background:', error);
    return null;
  }
}

/**
 * Create a gradient overlay on top of an image
 * @param {string} imageUrl - Base image URL
 * @param {Object} options - Gradient options
 * @param {string} options.gradient - Gradient type ('dark', 'light', 'custom')
 * @param {number} options.opacity - Gradient opacity (0-1)
 * @returns {Promise<Buffer|null>} Processed image buffer
 */
async function addGradientOverlay(imageUrl, options = {}) {
  try {
    const { gradient = 'dark', opacity = 0.7 } = options;

    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer'
    });

    // Create gradient overlay based on type
    let gradientOverlay;
    switch (gradient) {
      case 'dark':
        gradientOverlay = {
          width: 1920,
          height: 1080,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: opacity }
        };
        break;
      case 'light':
        gradientOverlay = {
          width: 1920,
          height: 1080,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: opacity }
        };
        break;
      default:
        gradientOverlay = {
          width: 1920,
          height: 1080,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: opacity }
        };
    }

    const overlay = sharp({
      create: gradientOverlay
    });

    const processedImageBuffer = await sharp(response.data)
      .resize(1920, 1080, { fit: 'cover', position: 'center' })
      .composite([{ input: await overlay.toBuffer(), blend: 'multiply' }])
      .toBuffer();

    return processedImageBuffer;

  } catch (error) {
    console.error('[ImageProcessor] Error adding gradient overlay:', error);
    return null;
  }
}

module.exports = { blurImage, convertBannerToBackground, addGradientOverlay }; 