require('dotenv').config();
const host = process.env.HOST_NAME 
  ? (process.env.HOST_NAME.startsWith('http')
      ? process.env.HOST_NAME
      : `https://${process.env.HOST_NAME}`)
  : 'http://localhost:1337';
function getEpisodeThumbnail(imageUrl, hideEpisodeThumbnails) {
  if (!imageUrl) {
    return null;
  }
  
  if (hideEpisodeThumbnails) {
    return `${host}/api/image/blur?url=${encodeURIComponent(imageUrl)}`;
  }
  
  return imageUrl;
}

module.exports = { getEpisodeThumbnail };
