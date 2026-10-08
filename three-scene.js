(() => {
  if (typeof THREE === 'undefined') return;

  const canvas = document.getElementById('bg-canvas');
  const prefersReducedMotion = window.matchMedia('(prefers-color-scheme: no-preference)') &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.z = 32;

  const ACCENT = 0x7c6dfa;
  const ACCENT_2 = 0xb45cff;
  const PARTICLE_COUNT = window.innerWidth < 700 ? 90 : 180;
  const SPREAD = 40;
  const LINK_DISTANCE = 7.5;

  // --- Particle field ---
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const colors = new Float32Array(PARTICLE_COUNT * 3);
  const velocities = [];
  const colorA = new THREE.Color(ACCENT);
  const colorB = new THREE.Color(ACCENT_2);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * SPREAD * 2;
    positions[i * 3 + 1] = (Math.random() - 0.5) * SPREAD;
    positions[i * 3 + 2] = (Math.random() - 0.5) * SPREAD;

    const mixed = colorA.clone().lerp(colorB, Math.random());
    colors[i * 3] = mixed.r;
    colors[i * 3 + 1] = mixed.g;
    colors[i * 3 + 2] = mixed.b;

    velocities.push(
      new THREE.Vector3(
        (Math.random() - 0.5) * 0.015,
        (Math.random() - 0.5) * 0.015,
        (Math.random() - 0.5) * 0.015
      )
    );
  }

  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const particleMaterial = new THREE.PointsMaterial({
    size: 0.22,
    transparent: true,
    opacity: 0.9,
    sizeAttenuation: true,
    vertexColors: true,
  });

  const points = new THREE.Points(particleGeometry, particleMaterial);
  scene.add(points);

  // --- Connecting lines between nearby particles ---
  const maxLineSegments = PARTICLE_COUNT * 6;
  const linePositions = new Float32Array(maxLineSegments * 2 * 3);
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));

  const lineMaterial = new THREE.LineBasicMaterial({
    color: ACCENT,
    transparent: true,
    opacity: 0.14,
  });

  const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
  scene.add(lines);

  // --- Centerpiece: distorted wireframe icosahedron ---
  const icoGeometry = new THREE.IcosahedronGeometry(9, 1);
  const icoMaterial = new THREE.MeshBasicMaterial({
    color: ACCENT_2,
    wireframe: true,
    transparent: true,
    opacity: 0.2,
  });
  const icosahedron = new THREE.Mesh(icoGeometry, icoMaterial);
  icosahedron.position.set(10, 2, -10);
  scene.add(icosahedron);

  // --- Mouse interaction ---
  const mouse = { x: 0, y: 0 };
  const targetRotation = { x: 0, y: 0 };
  window.addEventListener('mousemove', (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
    targetRotation.y = mouse.x * 0.3;
    targetRotation.x = mouse.y * 0.2;
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const clock = new THREE.Clock();

  function updateParticles() {
    const posAttr = particleGeometry.attributes.position;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      let x = posAttr.getX(i) + velocities[i].x;
      let y = posAttr.getY(i) + velocities[i].y;
      let z = posAttr.getZ(i) + velocities[i].z;

      if (x > SPREAD || x < -SPREAD) velocities[i].x *= -1;
      if (y > SPREAD / 2 || y < -SPREAD / 2) velocities[i].y *= -1;
      if (z > SPREAD || z < -SPREAD) velocities[i].z *= -1;

      posAttr.setXYZ(i, x, y, z);
    }
    posAttr.needsUpdate = true;

    // Rebuild link lines between close particles (capped for perf)
    let segmentIndex = 0;
    const linePosAttr = lineGeometry.attributes.position;
    for (let i = 0; i < PARTICLE_COUNT && segmentIndex < maxLineSegments; i++) {
      for (let j = i + 1; j < PARTICLE_COUNT && segmentIndex < maxLineSegments; j++) {
        const dx = posAttr.getX(i) - posAttr.getX(j);
        const dy = posAttr.getY(i) - posAttr.getY(j);
        const dz = posAttr.getZ(i) - posAttr.getZ(j);
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < LINK_DISTANCE * LINK_DISTANCE) {
          linePosAttr.setXYZ(segmentIndex * 2, posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
          linePosAttr.setXYZ(segmentIndex * 2 + 1, posAttr.getX(j), posAttr.getY(j), posAttr.getZ(j));
          segmentIndex++;
        }
      }
    }
    lineGeometry.setDrawRange(0, segmentIndex * 2);
    linePosAttr.needsUpdate = true;
  }

  function animate() {
    requestAnimationFrame(animate);
    const elapsed = clock.getElapsedTime();

    if (!prefersReducedMotion) {
      updateParticles();
    }

    icosahedron.rotation.x = elapsed * 0.05;
    icosahedron.rotation.y = elapsed * 0.08;
    icoMaterial.opacity = 0.16 + Math.sin(elapsed * 0.6) * 0.06;

    points.rotation.y += (targetRotation.y * 0.3 - points.rotation.y) * 0.02;
    points.rotation.x += (targetRotation.x * 0.3 - points.rotation.x) * 0.02;
    lines.rotation.copy(points.rotation);

    camera.position.x += (mouse.x * 3 - camera.position.x) * 0.02;
    camera.position.y += (-mouse.y * 3 - camera.position.y) * 0.02;
    camera.lookAt(scene.position);

    renderer.render(scene, camera);
  }

  animate();
})();
