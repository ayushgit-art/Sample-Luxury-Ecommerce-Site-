require('dotenv').config();

const fs = require('node:fs/promises');
const path = require('node:path');
const cloudinary = require('cloudinary').v2;
const Product = require('../models/Product');
const connectDatabase = require('../config/database');

const imagesDirectory = path.resolve(__dirname, '..', 'public', 'images');
const productUploadsDirectory = path.resolve(__dirname, '..', 'uploads', 'products');
const cloudinaryFolder = 'maison-atelier/products';
const counts = {
  productsProcessed: 0,
  imagesFound: 0,
  imagesUploaded: 0,
  imagesMigrated: 0,
  imagesAlreadyOnCloudinary: 0,
  imagesSkipped: 0,
  imagesFailed: 0,
  productsUpdated: 0,
  productsTotal: 0
};

function configureCloudinary() {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error('Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env.');
  }

  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true
  });
}

function isCloudinaryUrl(reference) {
  try {
    const url = new URL(reference);
    return url.protocol === 'https:' && url.hostname === 'res.cloudinary.com';
  } catch (_error) {
    return false;
  }
}

function isExternalUrl(reference) {
  try {
    const url = new URL(reference);
    return ['http:', 'https:'].includes(url.protocol);
  } catch (_error) {
    return false;
  }
}

function normalizeReference(reference) {
  let normalized;
  try {
    normalized = decodeURIComponent(String(reference)).replace(/\\/g, '/');
  } catch (_error) {
    return null;
  }
  return normalized.split(/[?#]/, 1)[0].replace(/^\.\//, '');
}

async function loadImageIndex() {
  const byPublicImagePath = new Map();
  const byProductUploadPath = new Map();
  const byFileName = new Map();

  async function walk(rootDirectory, relativePathIndex) {
    async function visit(directory) {
      let entries;
      try {
        entries = await fs.readdir(directory, { withFileTypes: true });
      } catch (error) {
        if (error.code === 'ENOENT') return;
        throw error;
      }

      for (const entry of entries) {
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          await visit(absolutePath);
        } else if (entry.isFile()) {
          const relativePath = path.relative(rootDirectory, absolutePath).replace(/\\/g, '/');
          relativePathIndex.set(relativePath.toLowerCase(), absolutePath);
          const fileName = entry.name.toLowerCase();
          const matches = byFileName.get(fileName) || [];
          matches.push(absolutePath);
          byFileName.set(fileName, matches);
        }
      }
    }

    await visit(rootDirectory);
  }

  await walk(imagesDirectory, byPublicImagePath);
  await walk(productUploadsDirectory, byProductUploadPath);
  return { byPublicImagePath, byProductUploadPath, byFileName };
}

function localReferenceMatch(relativePath, sourceIndex) {
  const segments = relativePath.split('/');
  if (!relativePath || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    return null;
  }
  return sourceIndex.get(relativePath.toLowerCase()) || null;
}

function resolveLocalImage(reference, imageIndex) {
  const normalized = normalizeReference(reference);
  if (!normalized) return { reason: 'invalid image reference' };

  let relativePath = normalized;
  let sourceIndex = imageIndex.byPublicImagePath;
  if (/^\/images\//i.test(relativePath)) {
    relativePath = relativePath.slice('/images/'.length);
  } else if (/^images\//i.test(relativePath)) {
    relativePath = relativePath.slice('images/'.length);
  } else if (/^public\/images\//i.test(relativePath)) {
    relativePath = relativePath.slice('public/images/'.length);
  } else if (/^\/uploads\/products\//i.test(relativePath)) {
    relativePath = relativePath.slice('/uploads/products/'.length);
    sourceIndex = imageIndex.byProductUploadPath;
  } else if (/^uploads\/products\//i.test(relativePath)) {
    relativePath = relativePath.slice('uploads/products/'.length);
    sourceIndex = imageIndex.byProductUploadPath;
  } else if (/^\/uploads\//i.test(relativePath)) {
    return { reason: 'reference is outside uploads/products' };
  } else if (relativePath.startsWith('/')) {
    return { reason: 'absolute path does not identify an approved product image' };
  }

  const exactPath = localReferenceMatch(relativePath, sourceIndex);
  if (exactPath) return { path: exactPath };

  if (!relativePath.includes('/')) {
    const matches = imageIndex.byFileName.get(relativePath.toLowerCase()) || [];
    if (matches.length === 1) return { path: matches[0] };
    if (matches.length > 1) return { reason: 'filename is ambiguous across approved image directories' };
  }

  return { reason: 'no exact file match under public/images or uploads/products' };
}

function makePublicId(product, imagePosition) {
  const safeSlug = String(product.slug || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'product';
  return `${safeSlug}-${String(product._id)}-${imagePosition}`;
}

function secureCloudinaryUrl(result) {
  const url = new URL(result?.secure_url);
  if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || !result.public_id) {
    throw new Error('Cloudinary did not return a valid secure image URL.');
  }
  return url.toString();
}

async function findExistingAsset(publicId) {
  try {
    const resource = await cloudinary.api.resource(`${cloudinaryFolder}/${publicId}`, {
      resource_type: 'image'
    });
    return secureCloudinaryUrl(resource);
  } catch (error) {
    const cloudinaryError = error?.error || error;
    if (cloudinaryError?.http_code === 404) return null;
    throw cloudinaryError;
  }
}

async function uploadImage(filePath, publicId) {
  const result = await cloudinary.uploader.upload(filePath, {
    folder: cloudinaryFolder,
    public_id: publicId,
    resource_type: 'image',
    overwrite: false,
    unique_filename: false,
    use_filename: false
  });
  return secureCloudinaryUrl(result);
}

async function migrateProduct(product, imageIndex) {
  const originalImages = [...product.images];
  const migratedImages = [...originalImages];
  let imageChanged = false;
  const failedReferences = [];

  console.log(`Product ${counts.productsProcessed}/${counts.productsTotal}: ${product.name}`);

  for (let index = 0; index < originalImages.length; index += 1) {
    const reference = originalImages[index];
    const imageNumber = index + 1;

    if (isCloudinaryUrl(reference)) {
      counts.imagesAlreadyOnCloudinary += 1;
      console.log(`Image ${imageNumber}: already on Cloudinary`);
      continue;
    }

    if (isExternalUrl(reference)) {
      counts.imagesSkipped += 1;
      console.log(`Image ${imageNumber}: skipped (external URL)`);
      console.log(`  ${product.name}: ${reference}`);
      continue;
    }

    const resolved = resolveLocalImage(reference, imageIndex);
    if (!resolved.path) {
      counts.imagesSkipped += 1;
      console.log(`Image ${imageNumber}: skipped (${resolved.reason})`);
      console.log(`  ${product.name}: ${reference}`);
      continue;
    }

    counts.imagesFound += 1;
    const publicId = makePublicId(product, imageNumber);

    try {
      let url = await findExistingAsset(publicId);
      if (url) {
        console.log(`Image ${imageNumber}: existing migration asset reused`);
      } else {
        url = await uploadImage(resolved.path, publicId);
        counts.imagesUploaded += 1;
        console.log(`Image ${imageNumber}: uploaded`);
      }
      migratedImages[index] = url;
      imageChanged = true;
    } catch (error) {
      counts.imagesFailed += 1;
      failedReferences.push(reference);
      console.error(`Image ${imageNumber}: failed (${error.message})`);
      console.error(`  ${product.name}: ${reference}`);
    }
  }

  if (!imageChanged) return;

  try {
    const update = await Product.updateOne(
      { _id: product._id, images: originalImages },
      { $set: { images: migratedImages } },
      { runValidators: true }
    );
    if (update.matchedCount !== 1) {
      throw new Error('Product image array changed during migration; database update was skipped.');
    }
    counts.productsUpdated += 1;
    counts.imagesMigrated += migratedImages.reduce(
      (total, image, index) => total + (image !== originalImages[index] ? 1 : 0),
      0
    );
  } catch (error) {
    for (let index = 0; index < originalImages.length; index += 1) {
      if (migratedImages[index] !== originalImages[index]) {
        counts.imagesFailed += 1;
        failedReferences.push(originalImages[index]);
      }
    }
    console.error(`Database update failed for ${product.name}: ${error.message}`);
    for (const reference of failedReferences) {
      console.error(`  ${product.name}: ${reference}`);
    }
  }
}

async function main() {
  configureCloudinary();
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured.');

  const imageIndex = await loadImageIndex();
  await connectDatabase();
  try {
    const products = await Product.find().select('_id name slug images').lean();
    counts.productsTotal = products.length;
    for (const product of products) {
      counts.productsProcessed += 1;
      await migrateProduct(product, imageIndex);
    }

    console.log('\nMigration summary');
    console.log(`Products processed: ${counts.productsProcessed}`);
    console.log(`Images found in approved local directories: ${counts.imagesFound}`);
    console.log(`Images uploaded: ${counts.imagesUploaded}`);
    console.log(`Images migrated in MongoDB: ${counts.imagesMigrated}`);
    console.log(`Images already on Cloudinary: ${counts.imagesAlreadyOnCloudinary}`);
    console.log(`Images skipped: ${counts.imagesSkipped}`);
    console.log(`Images failed: ${counts.imagesFailed}`);
    console.log(`Products updated: ${counts.productsUpdated}`);
    if (counts.imagesFailed) process.exitCode = 1;
  } finally {
    const mongoose = require('mongoose');
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(`Product image migration failed: ${error.message}`);
  const mongoose = require('mongoose');
  if (mongoose.connection.readyState) {
    mongoose.disconnect().finally(() => { process.exitCode = 1; });
  } else {
    process.exitCode = 1;
  }
});
