const upload = document.querySelector('[data-product-image-upload]');

if (upload) {
  const form = upload.closest('form');
  const input = upload.querySelector('input[type="file"]');
  const dropzone = upload.querySelector('[data-image-dropzone]');
  const previews = upload.querySelector('[data-image-previews]');
  const status = upload.querySelector('[data-image-upload-status]');
  const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const maximumFileSize = 5 * 1024 * 1024;
  const maximumFiles = 8;
  let selectedFiles = [];

  const syncInputFiles = () => {
    const transfer = new DataTransfer();
    selectedFiles.forEach(({ file }) => transfer.items.add(file));
    input.files = transfer.files;
  };

  const renderPreviews = () => {
    previews.replaceChildren();
    selectedFiles.forEach(({ file, previewUrl }, index) => {
      const card = document.createElement('div');
      card.className = 'admin-image-preview';
      const image = document.createElement('img');
      image.src = previewUrl;
      image.alt = file.name;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove ${file.name}`);
      remove.innerHTML = '<i class="bi bi-x-lg" aria-hidden="true"></i>';
      remove.addEventListener('click', () => {
        URL.revokeObjectURL(previewUrl);
        selectedFiles.splice(index, 1);
        syncInputFiles();
        renderPreviews();
      });
      card.append(image, remove);
      previews.append(card);
    });
    status.textContent = selectedFiles.length
      ? `${selectedFiles.length} image${selectedFiles.length === 1 ? '' : 's'} selected.`
      : 'No images selected.';
  };

  const addFiles = (files) => {
    const availableSlots = maximumFiles - selectedFiles.length;
    if (files.length > availableSlots) {
      syncInputFiles();
      status.textContent = `Select no more than ${maximumFiles} images in total.`;
      return;
    }
    for (const file of files) {
      if (!allowedTypes.has(file.type) || file.size > maximumFileSize) {
        syncInputFiles();
        status.textContent = 'Choose JPEG, PNG, or WebP images no larger than 5 MB each.';
        return;
      }
    }
    selectedFiles.push(...files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })));
    syncInputFiles();
    renderPreviews();
  };

  dropzone.addEventListener('click', () => input.click());
  dropzone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      input.click();
    }
  });
  input.addEventListener('change', () => {
    const files = Array.from(input.files);
    input.value = '';
    addFiles(files);
  });
  for (const eventName of ['dragenter', 'dragover']) {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.add('is-dragging');
    });
  }
  for (const eventName of ['dragleave', 'drop']) {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.remove('is-dragging');
    });
  }
  dropzone.addEventListener('drop', (event) => addFiles(Array.from(event.dataTransfer.files)));
  form.addEventListener('submit', (event) => {
    if (!selectedFiles.length) {
      event.preventDefault();
      status.textContent = 'Select at least one product image.';
      dropzone.focus();
    }
  });
}
