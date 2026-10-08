(() => {
  const DB_NAME = 'portfolio-db';
  const STORE = 'screenshots';
  const MAX_DIMENSION = 1400;
  const JPEG_QUALITY = 0.82;

  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB unsupported'));
        return;
      }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'project' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function getImages(project) {
    try {
      const db = await openDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(project);
        req.onsuccess = () => resolve(req.result ? req.result.images : []);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return [];
    }
  }

  async function saveImages(project, images) {
    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({ project, images });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // IndexedDB unavailable (private browsing, etc.) — edits just won't persist.
    }
  }

  function readAndResize(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Could not read image'));
        img.onload = () => {
          let { width, height } = img;
          if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
            const scale = MAX_DIMENSION / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function uid() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  // --- Edit mode state ---
  const editToggle = document.getElementById('editToggle');
  const body = document.body;

  function setEditMode(on) {
    body.classList.toggle('edit-mode', on);
    try {
      localStorage.setItem('portfolio-edit-mode', on ? '1' : '0');
    } catch {}
  }

  editToggle.addEventListener('click', () => {
    setEditMode(!body.classList.contains('edit-mode'));
  });

  try {
    if (localStorage.getItem('portfolio-edit-mode') === '1') setEditMode(true);
  } catch {}

  // --- Lightbox ---
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxClose = document.getElementById('lightboxClose');
  const lightboxPrev = document.getElementById('lightboxPrev');
  const lightboxNext = document.getElementById('lightboxNext');
  let lightboxImages = [];
  let lightboxIndex = 0;

  function openLightbox(images, index) {
    lightboxImages = images;
    lightboxIndex = index;
    lightboxImg.src = lightboxImages[lightboxIndex].src;
    lightbox.classList.add('is-open');
    lightbox.setAttribute('aria-hidden', 'false');
  }

  function closeLightbox() {
    lightbox.classList.remove('is-open');
    lightbox.setAttribute('aria-hidden', 'true');
    lightboxImg.src = '';
  }

  function stepLightbox(delta) {
    if (!lightboxImages.length) return;
    lightboxIndex = (lightboxIndex + delta + lightboxImages.length) % lightboxImages.length;
    lightboxImg.src = lightboxImages[lightboxIndex].src;
  }

  lightboxClose.addEventListener('click', closeLightbox);
  lightboxPrev.addEventListener('click', () => stepLightbox(-1));
  lightboxNext.addEventListener('click', () => stepLightbox(1));
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
  });
  document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('is-open')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') stepLightbox(-1);
    if (e.key === 'ArrowRight') stepLightbox(1);
  });

  // --- Shared hidden file input ---
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.multiple = true;
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  let pendingAction = null; // { project, mode: 'add' | 'replace', imageId }

  fileInput.addEventListener('change', async () => {
    const files = Array.from(fileInput.files || []);
    fileInput.value = '';
    if (!files.length || !pendingAction) return;
    const { project, mode, imageId } = pendingAction;
    pendingAction = null;

    const images = await getImages(project);

    if (mode === 'replace') {
      const target = images.find((img) => img.id === imageId);
      if (target) {
        target.src = await readAndResize(files[0]);
      }
    } else {
      for (const file of files) {
        images.push({ id: uid(), src: await readAndResize(file) });
      }
    }

    await saveImages(project, images);
    renderProject(project);
  });

  function triggerUpload(project, mode, imageId) {
    pendingAction = { project, mode, imageId };
    fileInput.multiple = mode !== 'replace';
    fileInput.click();
  }

  // --- Rendering ---
  async function renderProject(project) {
    const container = document.querySelector(`.screenshot-scroll[data-project="${project}"]`);
    if (!container) return;
    const images = await getImages(project);

    container.innerHTML = '';
    container.classList.toggle('has-content', images.length > 0);

    images.forEach((image, index) => {
      const thumb = document.createElement('div');
      thumb.className = 'screenshot-thumb';
      thumb.dataset.id = image.id;

      const img = document.createElement('img');
      img.src = image.src;
      img.alt = `${project} screenshot ${index + 1}`;
      img.addEventListener('click', () => openLightbox(images, index));
      thumb.appendChild(img);

      const actions = document.createElement('div');
      actions.className = 'thumb-actions';

      const moveLeft = document.createElement('button');
      moveLeft.type = 'button';
      moveLeft.title = 'Move left';
      moveLeft.textContent = '←';
      moveLeft.disabled = index === 0;
      moveLeft.addEventListener('click', async (e) => {
        e.stopPropagation();
        const current = await getImages(project);
        [current[index - 1], current[index]] = [current[index], current[index - 1]];
        await saveImages(project, current);
        renderProject(project);
      });

      const replace = document.createElement('button');
      replace.type = 'button';
      replace.title = 'Replace image';
      replace.textContent = '✎';
      replace.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerUpload(project, 'replace', image.id);
      });

      const del = document.createElement('button');
      del.type = 'button';
      del.title = 'Delete image';
      del.textContent = '×';
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        const current = await getImages(project);
        const next = current.filter((img) => img.id !== image.id);
        await saveImages(project, next);
        renderProject(project);
      });

      const moveRight = document.createElement('button');
      moveRight.type = 'button';
      moveRight.title = 'Move right';
      moveRight.textContent = '→';
      moveRight.disabled = index === images.length - 1;
      moveRight.addEventListener('click', async (e) => {
        e.stopPropagation();
        const current = await getImages(project);
        [current[index], current[index + 1]] = [current[index + 1], current[index]];
        await saveImages(project, current);
        renderProject(project);
      });

      actions.append(moveLeft, replace, del, moveRight);
      thumb.appendChild(actions);
      container.appendChild(thumb);
    });

    const addTile = document.createElement('button');
    addTile.type = 'button';
    addTile.className = 'add-screenshot-tile';
    addTile.innerHTML = '<span class="plus">+</span><span>Add screenshot</span>';
    addTile.addEventListener('click', () => triggerUpload(project, 'add'));
    container.appendChild(addTile);
  }

  document.querySelectorAll('.screenshot-scroll[data-project]').forEach((el) => {
    renderProject(el.dataset.project);
  });
})();
