const { Readable } = require('node:stream');
const cloudinary = require('cloudinary').v2;

function getConfiguredCloudinary() {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error('Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET to upload product images.');
  }

  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true
  });
  return cloudinary;
}

function uploadProductImage(buffer, publicId) {
  const configuredCloudinary = getConfiguredCloudinary();

  return new Promise((resolve, reject) => {
    const upload = configuredCloudinary.uploader.upload_stream({
      folder: 'maison-atelier/products',
      public_id: publicId,
      resource_type: 'image'
    }, (error, result) => {
      if (error) return reject(error);
      let imageUrl;
      try {
        imageUrl = new URL(result?.secure_url);
      } catch (_error) {
        return reject(new Error('Cloudinary did not return a secure product image URL.'));
      }
      if (imageUrl.protocol !== 'https:' || !result.public_id) {
        return reject(new Error('Cloudinary did not return a secure product image URL.'));
      }
      resolve({ url: result.secure_url, publicId: result.public_id });
    });

    upload.on('error', reject);
    Readable.from([buffer]).pipe(upload);
  });
}

async function deleteProductImage(publicId) {
  const result = await getConfiguredCloudinary().uploader.destroy(publicId, { resource_type: 'image' });
  if (result.result !== 'ok' && result.result !== 'not found') {
    throw new Error(`Cloudinary could not remove image ${publicId}.`);
  }
}

module.exports = { uploadProductImage, deleteProductImage };
