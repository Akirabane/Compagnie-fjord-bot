/**
 * three-bg.js — Fjord 3D Background Scene
 * Particle network + aurora ribbons + floating Norse geometry
 */
(function () {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas || typeof THREE === 'undefined') return;

  // iOS Safari ignore parfois pointer-events:none sur canvas — forcer via JS
  canvas.style.pointerEvents = 'none';
  canvas.style.touchAction   = 'none';

  const isMobile = window.innerWidth < 768;

  // ── Renderer ──────────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 0, 90);

  // ── Mouse parallax ────────────────────────────────────────────────────────
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener('mousemove', e => {
    mouse.tx = (e.clientX / window.innerWidth  - 0.5) * 18;
    mouse.ty = (e.clientY / window.innerHeight - 0.5) * -10;
  });
  window.addEventListener('touchmove', e => {
    const t = e.touches[0];
    mouse.tx = (t.clientX / window.innerWidth  - 0.5) * 10;
    mouse.ty = (t.clientY / window.innerHeight - 0.5) * -6;
  }, { passive: true });

  // ── Colours ───────────────────────────────────────────────────────────────
  const GOLD   = new THREE.Color(0xe2b84a);
  const BLUE   = new THREE.Color(0x1a3a6e);
  const TEAL   = new THREE.Color(0x0d4a5c);
  const WHITE  = new THREE.Color(0xd0dff0);

  // ── Particle field ────────────────────────────────────────────────────────
  const PARTICLE_COUNT = isMobile ? 320 : 700;
  const positions  = new Float32Array(PARTICLE_COUNT * 3);
  const pColors    = new Float32Array(PARTICLE_COUNT * 3);
  const pSizes     = new Float32Array(PARTICLE_COUNT);
  const pVelocity  = [];

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const spread = 160;
    positions[i * 3]     = (Math.random() - 0.5) * spread;
    positions[i * 3 + 1] = (Math.random() - 0.5) * spread * 0.6;
    positions[i * 3 + 2] = (Math.random() - 0.5) * spread * 0.4 - 20;

    const t  = Math.random();
    const c  = t < 0.15 ? GOLD : t < 0.4 ? WHITE : BLUE;
    pColors[i * 3]     = c.r;
    pColors[i * 3 + 1] = c.g;
    pColors[i * 3 + 2] = c.b;

    pSizes[i] = t < 0.15 ? Math.random() * 2.8 + 1.4 : Math.random() * 1.4 + 0.5;

    pVelocity.push({
      x: (Math.random() - 0.5) * 0.006,
      y: (Math.random() - 0.5) * 0.004,
      z: 0,
    });
  }

  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(positions,  3));
  pGeo.setAttribute('color',    new THREE.BufferAttribute(pColors,    3));
  pGeo.setAttribute('size',     new THREE.BufferAttribute(pSizes,     1));

  const pMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute float size;
      attribute vec3 color;
      varying vec3 vColor;
      varying float vAlpha;
      uniform float uTime;
      void main(){
        vColor = color;
        vec3 pos = position;
        pos.y += sin(uTime * 0.3 + position.x * 0.05) * 0.4;
        pos.x += cos(uTime * 0.2 + position.y * 0.05) * 0.3;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        float dist = length(gl_Position.xyz);
        vAlpha = clamp(1.0 - dist * 0.008, 0.15, 0.9);
        gl_PointSize = size * (280.0 / -gl_Position.z);
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      void main(){
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float alpha = (1.0 - smoothstep(0.4, 1.0, d)) * vAlpha;
        if(alpha < 0.01) discard;
        gl_FragColor = vec4(vColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
  });

  const particles = new THREE.Points(pGeo, pMat);
  scene.add(particles);

  // ── Connection lines ──────────────────────────────────────────────────────
  const LINE_COUNT   = isMobile ? 60 : 160;
  const linePositions = new Float32Array(LINE_COUNT * 2 * 3);
  const lineAlphas    = new Float32Array(LINE_COUNT * 2);
  const linePairs     = [];

  function pickLinePairs() {
    linePairs.length = 0;
    for (let i = 0; i < LINE_COUNT; i++) {
      const a = Math.floor(Math.random() * PARTICLE_COUNT);
      const b = Math.floor(Math.random() * PARTICLE_COUNT);
      linePairs.push([a, b]);
    }
  }
  pickLinePairs();
  setInterval(pickLinePairs, 4000);

  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
  lineGeo.setAttribute('alpha',    new THREE.BufferAttribute(lineAlphas,    1));

  const lineMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute float alpha;
      varying float vAlpha;
      void main(){
        vAlpha = alpha;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      void main(){
        gl_FragColor = vec4(0.55, 0.45, 0.22, vAlpha * 0.18);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const lines = new THREE.LineSegments(lineGeo, lineMat);
  scene.add(lines);

  // ── Aurora ribbons ────────────────────────────────────────────────────────
  function buildAurora(yBase, hue, speed, amp) {
    const W = 80, segs = 60;
    const geo = new THREE.BufferGeometry();
    const verts = new Float32Array((segs + 1) * 2 * 3);
    const uvs   = new Float32Array((segs + 1) * 2 * 2);
    const idx   = [];

    for (let i = 0; i <= segs; i++) {
      const x  = (i / segs - 0.5) * W * 2;
      const u  = i / segs;
      verts[i * 6]     = x; verts[i * 6 + 1] = yBase;     verts[i * 6 + 2] = -40;
      verts[i * 6 + 3] = x; verts[i * 6 + 4] = yBase + 9; verts[i * 6 + 5] = -40;
      uvs[i * 4] = u; uvs[i * 4 + 1] = 0;
      uvs[i * 4 + 2] = u; uvs[i * 4 + 3] = 1;
      if (i < segs) {
        const b = i * 2;
        idx.push(b, b+1, b+2, b+1, b+3, b+2);
      }
    }

    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.setAttribute('uv',       new THREE.BufferAttribute(uvs,   2));
    geo.setIndex(idx);

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime:  { value: 0 },
        uHue:   { value: hue },
        uSpeed: { value: speed },
        uAmp:   { value: amp },
      },
      vertexShader: `
        varying vec2 vUv;
        uniform float uTime;
        uniform float uSpeed;
        uniform float uAmp;
        void main(){
          vUv = uv;
          vec3 pos = position;
          float wave = sin(pos.x * 0.06 + uTime * uSpeed) * uAmp
                     + sin(pos.x * 0.03 - uTime * uSpeed * 0.7) * uAmp * 0.5;
          pos.y += wave;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uHue;
        uniform float uTime;
        vec3 hsl2rgb(float h, float s, float l){
          float c = (1.0 - abs(2.0*l - 1.0)) * s;
          float x = c * (1.0 - abs(mod(h*6.0, 2.0) - 1.0));
          float m = l - c*0.5;
          vec3 rgb;
          if      (h < 1.0/6.0) rgb = vec3(c,x,0);
          else if (h < 2.0/6.0) rgb = vec3(x,c,0);
          else if (h < 3.0/6.0) rgb = vec3(0,c,x);
          else if (h < 4.0/6.0) rgb = vec3(0,x,c);
          else if (h < 5.0/6.0) rgb = vec3(x,0,c);
          else                   rgb = vec3(c,0,x);
          return rgb + m;
        }
        void main(){
          float shimmer = sin(vUv.x * 12.0 + uTime * 1.2) * 0.5 + 0.5;
          float h = uHue + shimmer * 0.06;
          float alpha = sin(vUv.y * 3.14159) * 0.22 * (0.5 + shimmer * 0.5);
          alpha *= smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
          if(alpha < 0.005) discard;
          vec3 col = hsl2rgb(h, 0.7, 0.55);
          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });

    return { mesh: new THREE.Mesh(geo, mat), mat };
  }

  const auroras = [
    buildAurora(-20, 0.52, 0.28, 2.2),
    buildAurora(-28, 0.58, 0.20, 1.6),
    buildAurora(-15, 0.48, 0.35, 1.8),
  ];
  auroras.forEach(a => scene.add(a.mesh));

  // ── Norse rune ring (login decoration) ───────────────────────────────────
  const runeRing = new THREE.Group();
  const torusGeo = new THREE.TorusGeometry(14, 0.18, 6, 80);
  const torusMat = new THREE.MeshBasicMaterial({
    color: 0xe2b84a, transparent: true, opacity: 0.25,
  });
  const torus = new THREE.Mesh(torusGeo, torusMat);
  runeRing.add(torus);

  const innerGeo = new THREE.TorusGeometry(10, 0.1, 6, 60);
  const innerMat = new THREE.MeshBasicMaterial({
    color: 0x60a5fa, transparent: true, opacity: 0.18,
  });
  runeRing.add(new THREE.Mesh(innerGeo, innerMat));

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const spikeGeo = new THREE.CylinderGeometry(0.06, 0.0, 4, 3);
    const spikeMat = new THREE.MeshBasicMaterial({ color: 0xe2b84a, transparent: true, opacity: 0.4 });
    const spike = new THREE.Mesh(spikeGeo, spikeMat);
    spike.position.set(Math.cos(a) * 14, Math.sin(a) * 14, 0);
    spike.rotation.z = a + Math.PI / 2;
    runeRing.add(spike);
  }
  runeRing.position.set(0, 0, 60);
  scene.add(runeRing);

  // ── Ambient glow orbs ─────────────────────────────────────────────────────
  function makeOrb(x, y, z, color, size) {
    const geo = new THREE.SphereGeometry(size, 16, 16);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) } },
      vertexShader: `varying vec3 vNormal; void main(){ vNormal=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vNormal;
        uniform vec3 uColor;
        void main(){
          float f = pow(0.7 - dot(vNormal, vec3(0,0,1.0)), 3.0);
          gl_FragColor = vec4(uColor, f * 0.35);
        }
      `,
      transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.BackSide,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    return m;
  }

  scene.add(makeOrb(-45, 20, -30, 0xe2b84a, 22));
  scene.add(makeOrb( 50,-18, -30, 0x1a5080, 28));
  scene.add(makeOrb(  0, 30, -20, 0x0d4a5c, 18));

  // ── Resize ────────────────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ── State: hide ring when app is visible ──────────────────────────────────
  let showRing = true;
  const appEl  = document.getElementById('app');
  const obs    = new MutationObserver(() => {
    showRing = appEl?.style.display === 'none' || appEl?.style.display === '';
    runeRing.visible = showRing;
  });
  if (appEl) obs.observe(appEl, { attributes: true, attributeFilter: ['style'] });

  // ── Animate ───────────────────────────────────────────────────────────────
  let t = 0;
  function animate() {
    requestAnimationFrame(animate);
    t += 0.005;

    // Lerp mouse parallax
    mouse.x += (mouse.tx - mouse.x) * 0.04;
    mouse.y += (mouse.ty - mouse.y) * 0.04;
    camera.position.x = mouse.x * 0.5;
    camera.position.y = mouse.y * 0.3;
    camera.lookAt(0, 0, 0);

    // Update shader time
    pMat.uniforms.uTime.value = t;
    auroras.forEach(a => { a.mat.uniforms.uTime.value = t; });

    // Move particles
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3]     += pVelocity[i].x;
      positions[i * 3 + 1] += pVelocity[i].y;
      // Wrap
      if (positions[i * 3]     >  80) positions[i * 3]     = -80;
      if (positions[i * 3]     < -80) positions[i * 3]     =  80;
      if (positions[i * 3 + 1] >  48) positions[i * 3 + 1] = -48;
      if (positions[i * 3 + 1] < -48) positions[i * 3 + 1] =  48;
    }
    pGeo.attributes.position.needsUpdate = true;

    // Update connection lines
    for (let i = 0; i < LINE_COUNT; i++) {
      const [a, b] = linePairs[i];
      const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
      const bx = positions[b * 3], by = positions[b * 3 + 1], bz = positions[b * 3 + 2];
      const dist = Math.sqrt((ax-bx)**2 + (ay-by)**2);
      const alpha = dist < 28 ? (1 - dist / 28) : 0;
      linePositions[i * 6]     = ax; linePositions[i * 6 + 1] = ay; linePositions[i * 6 + 2] = az;
      linePositions[i * 6 + 3] = bx; linePositions[i * 6 + 4] = by; linePositions[i * 6 + 5] = bz;
      lineAlphas[i * 2] = lineAlphas[i * 2 + 1] = alpha;
    }
    lineGeo.attributes.position.needsUpdate = true;
    lineGeo.attributes.alpha.needsUpdate    = true;

    // Rotate rune ring
    if (showRing) {
      runeRing.rotation.z += 0.003;
      runeRing.rotation.y  = Math.sin(t * 0.5) * 0.15;
    }

    renderer.render(scene, camera);
  }
  animate();
})();
