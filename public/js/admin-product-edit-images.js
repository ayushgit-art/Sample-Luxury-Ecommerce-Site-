const editor = document.querySelector('[data-edit-image-upload]');

if (editor) {
  const form = editor.closest('form');
  const urlsInput = editor.querySelector('[data-edit-image-urls]');
  const filesInput = editor.querySelector('[data-edit-image-files]');
  const previews = editor.querySelector('[data-edit-image-previews]');
  const status = editor.querySelector('[data-edit-image-status]');
  const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
  const maximumFileSize = 5 * 1024 * 1024;
  const maximumFiles = 8;
  let selectedFiles = [];

  const renderPreviews = () => {
    previews.replaceChildren();
    const urls = urlsInput.value.split(/\r?\n/).map((url) => url.trim()).filter(Boolean);
    const count = Math.max(urls.length, selectedFiles.length);

    for (let index = 0; index < count; index += 1) {
      const card = document.createElement('div');
      card.className = 'admin-image-preview';
      const image = document.createElement('img');
      const selected = selectedFiles[index];
      image.src = selected ? selected.previewUrl : urls[index];
      image.alt = selected ? `Selected replacement image ${index + 1}` : `Product image ${index + 1}`;
      card.append(image);
      if (selected) {
        const caption = document.createElement('span');
        caption.textContent = `Selected ${index + 1}`;
        card.append(caption);
      }
      previews.append(card);
    }
  };

  const clearSelectedFiles = () => {
    selectedFiles.forEach((file) => URL.revokeObjectURL(file.previewUrl));
    selectedFiles = [];
    filesInput.value = '';
    renderPreviews();
  };

  urlsInput.addEventListener('input', renderPreviews);
  filesInput.addEventListener('change', () => {
    const files = Array.from(filesInput.files);
    const urls = urlsInput.value.split(/\r?\n/).map((url) => url.trim()).filter(Boolean);
    const imageCount = Math.max(urls.length, files.length);

    if (files.length > maximumFiles || imageCount > maximumFiles) {
      clearSelectedFiles();
      status.textContent = `The product can have no more than ${maximumFiles} images.`;
      return;
    }
    if (files.some((file) => !allowedTypes.has(file.type) || file.size > maximumFileSize)) {
      clearSelectedFiles();
      status.textContent = 'Choose JPG, PNG, WebP, or AVIF images no larger than 5 MB each.';
      return;
    }

    selectedFiles.forEach((file) => URL.revokeObjectURL(file.previewUrl));
    selectedFiles = files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }));
    status.textContent = selectedFiles.length
      ? `${selectedFiles.length} local image${selectedFiles.length === 1 ? '' : 's'} selected. Saving uploads them to Cloudinary.`
      : 'No local replacement images selected.';
    renderPreviews();
  });

  form.addEventListener('submit', (event) => {
    const imageCount = Math.max(
      urlsInput.value.split(/\r?\n/).map((url) => url.trim()).filter(Boolean).length,
      selectedFiles.length
    );
    if (!imageCount || imageCount > maximumFiles) {
      event.preventDefault();
      status.textContent = `Provide between 1 and ${maximumFiles} product images.`;
      urlsInput.focus();
    }
  });

  renderPreviews();
}
