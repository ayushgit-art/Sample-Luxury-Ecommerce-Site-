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

function secureProductImageUrl(result) {
  let imageUrl;
  try {
    imageUrl = new URL(result?.secure_url);
  } catch (_error) {
    throw new Error('Cloudinary did not return a secure product image URL.');
  }
  if (imageUrl.protocol !== 'https:' || imageUrl.hostname !== 'res.cloudinary.com' || !result.public_id) {
    throw new Error('Cloudinary did not return a secure product image URL.');
  }
  return imageUrl.toString();
}

async function findProductImage(configuredCloudinary, publicId) {
  try {
    const result = await configuredCloudinary.api.resource(`maison-atelier/products/${publicId}`, {
      resource_type: 'image'
    });
    return secureProductImageUrl(result);
  } catch (error) {
    const cloudinaryError = error?.error || error;
    if (cloudinaryError?.http_code === 404) return null;
    throw cloudinaryError;
  }
}

async function uploadProductImage(buffer, publicId) {
  const configuredCloudinary = getConfiguredCloudinary();
  const existingUrl = await findProductImage(configuredCloudinary, publicId);
  if (existingUrl) return { url: existingUrl, publicId, reused: true };

  return new Promise((resolve, reject) => {
    const upload = configuredCloudinary.uploader.upload_stream({
      folder: 'maison-atelier/products',
      public_id: publicId,
      resource_type: 'image',
      overwrite: false
    }, async (error, result) => {
      if (error) {
        try {
          const existing = await findProductImage(configuredCloudinary, publicId);
          if (existing) return resolve({ url: existing, publicId, reused: true });
        } catch (lookupError) {
          return reject(new AggregateError([error, lookupError], 'Cloudinary upload failed and its asset could not be checked.'));
        }
        return reject(error);
      }
      try {
        resolve({ url: secureProductImageUrl(result), publicId: result.public_id, reused: false });
      } catch (validationError) {
        reject(validationError);
      }
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
