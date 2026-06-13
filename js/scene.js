/* ==========================================================================
   scene.js v4 — 电影级动态太阳系
   真实 NASA 级纹理（程序化兜底）/ 伴飞相机：镜头飞向行星完成转场
   FOV 冲刺感 / 银河背景球 / 日冕脉动 / 月球绕地球 / 小行星带 / 彗星
   Hero 鼠标轨道驾驶 · 全程行星真实公转，相机是太阳系里的飞船
   ========================================================================== */
(function () {
  'use strict';

  var canvas = document.getElementById('cosmos');
  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (typeof THREE === 'undefined') { document.body.classList.add('fallback-bg'); return; }

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) { document.body.classList.add('fallback-bg'); return; }

  var isMobile = window.innerWidth < 768;
  var lowPower = (navigator.hardwareConcurrency || 8) < 4;
  var Q = (isMobile || lowPower) ? 0.45 : 1;
  var SEG = (isMobile || lowPower) ? 40 : 64;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  var scene = new THREE.Scene();

  var camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 4000);

  // ---------- 灯光 ----------
  scene.add(new THREE.AmbientLight(0x5e6788, 0.45));
  var sunLight = new THREE.PointLight(0xfff2d0, 2.2, 0, 1.45);
  scene.add(sunLight);
  var camLight = new THREE.PointLight(0xbfd4ff, 0.55, 700, 2);
  scene.add(camLight);

  /* ======================================================================
     一、纹理：真实贴图优先，加载失败自动回退程序化贴图
     ====================================================================== */
  var texLoader = new THREE.TextureLoader();

  function noiseSpots(ctx, w, h, n, rMin, rMax, color, alpha) {
    for (var i = 0; i < n; i++) {
      var x = Math.random() * w, y = Math.random() * h;
      var r = rMin + Math.random() * (rMax - rMin);
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(' + color + ',' + alpha + ')');
      g.addColorStop(1, 'rgba(' + color + ',0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }

  function bandTexture(stops, spots) {
    var c = document.createElement('canvas'); c.width = 512; c.height = 256;
    var ctx = c.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, 0, 256);
    stops.forEach(function (s) { g.addColorStop(s[0], s[1]); });
    ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 256);
    if (spots) spots(ctx);
    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    return tex;
  }

  var FALLBACKS = {
    sun: function () {
      return bandTexture([[0, '#ffdf80'], [0.5, '#ffc23e'], [1, '#ff9a2a']],
        function (ctx) { noiseSpots(ctx, 512, 256, 70, 4, 26, '255,120,30', 0.5); });
    },
    mercury: function () {
      return bandTexture([[0, '#9a8f86'], [0.5, '#7c726b'], [1, '#5e564f']],
        function (ctx) { noiseSpots(ctx, 512, 256, 90, 3, 14, '60,52,46', 0.5); });
    },
    venus: function () {
      return bandTexture([[0, '#e8c98e'], [0.35, '#d9b478'], [0.7, '#c89c5f'], [1, '#b88b50']]);
    },
    earth: function () {
      return bandTexture([[0, '#1c4f8f'], [0.45, '#1f6db4'], [1, '#143b6e']],
        function (ctx) {
          noiseSpots(ctx, 512, 256, 22, 14, 52, '46,140,86', 0.75);
          noiseSpots(ctx, 512, 256, 30, 10, 40, '255,255,255', 0.28);
        });
    },
    mars: function () {
      return bandTexture([[0, '#d97b4f'], [0.4, '#c05f38'], [1, '#8a3c24']],
        function (ctx) { noiseSpots(ctx, 512, 256, 60, 5, 22, '120,50,28', 0.45); });
    },
    jupiter: function () {
      return bandTexture([[0, '#d9b690'], [0.18, '#c39a6f'], [0.3, '#e8d3b4'], [0.42, '#b07f50'],
        [0.55, '#e3c79f'], [0.68, '#a8744a'], [0.82, '#d6b68c'], [1, '#bf9264']]);
    },
    saturn: function () {
      return bandTexture([[0, '#e6d3a8'], [0.25, '#d4bb8a'], [0.5, '#e9d9b4'], [0.75, '#c9ad7c'], [1, '#b89a68']]);
    },
    uranus: function () { return bandTexture([[0, '#9fe6ec'], [0.5, '#7fd4de'], [1, '#5fb8c6']]); },
    neptune: function () { return bandTexture([[0, '#4f7fe6'], [0.45, '#3a63c9'], [1, '#243f92']]); },
    moon: function () {
      return bandTexture([[0, '#bdbdbd'], [0.5, '#9c9c9c'], [1, '#7a7a7a']],
        function (ctx) { noiseSpots(ctx, 512, 256, 80, 3, 16, '90,90,90', 0.5); });
    }
  };

  function loadTex(file, fallbackKey) {
    var holder = { tex: FALLBACKS[fallbackKey] ? FALLBACKS[fallbackKey]() : null };
    var real = texLoader.load(
      'assets/textures/' + file,
      function (t) {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = renderer.capabilities.getMaxAnisotropy();
        if (holder.onReady) holder.onReady(t);
      },
      undefined,
      function () { /* 加载失败（如 file:// CORS）保持程序化贴图 */ }
    );
    holder.real = real;
    return holder;
  }

  function applyTex(material, file, fallbackKey) {
    var h = loadTex(file, fallbackKey);
    material.map = h.tex;
    h.onReady = function (t) { material.map = t; material.needsUpdate = true; };
  }

  /* ======================================================================
     二、银河背景球 + 星空粒子
     ====================================================================== */
  (function buildMilkyWay() {
    var mat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, color: 0x353d52 });
    applyTex(mat, '2k_stars_milky_way.jpg', null);
    var sky = new THREE.Mesh(new THREE.SphereGeometry(1900, 48, 32), mat);
    sky.rotation.x = 0.35;
    scene.add(sky);
  })();

  function makeSprite(inner, outer) {
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, inner); g.addColorStop(0.35, outer); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }
  var softWhite = makeSprite('rgba(255,255,255,1)', 'rgba(190,210,255,0.45)');
  var softGlow  = makeSprite('rgba(255,255,255,1)', 'rgba(120,160,255,0.55)');

  function buildStars(opts) {
    var n = Math.round(opts.count * Q);
    var pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    var color = new THREE.Color();
    for (var i = 0; i < n; i++) {
      // 全空间球壳分布，环绕整个太阳系
      var rr = opts.rMin + Math.random() * (opts.rMax - opts.rMin);
      var th = Math.random() * Math.PI * 2;
      var ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3]     = rr * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = rr * Math.cos(ph) * 0.6;
      pos[i * 3 + 2] = rr * Math.sin(ph) * Math.sin(th);
      color.copy(opts.colorA).lerp(opts.colorB, Math.random());
      if (Math.random() < opts.brightChance) color.multiplyScalar(1.6);
      col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    var pts = new THREE.Points(geo, new THREE.PointsMaterial({
      size: opts.size, map: opts.map, vertexColors: true, transparent: true,
      opacity: opts.opacity, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
    }));
    pts.userData.rotSpeed = opts.rotSpeed;
    scene.add(pts);
    return pts;
  }

  var starLayers = [
    buildStars({ count: 5200, rMin: 600, rMax: 1500, size: 2.4, opacity: 0.9,
      colorA: new THREE.Color(0xbfd4ff), colorB: new THREE.Color(0xffffff), brightChance: 0.05, map: softWhite, rotSpeed: 0.003 }),
    buildStars({ count: 1500, rMin: 420, rMax: 1000, size: 7, opacity: 0.42,
      colorA: new THREE.Color(0x00e5ff), colorB: new THREE.Color(0x7c4dff), brightChance: 0.1, map: softGlow, rotSpeed: 0.006 })
  ];
  var twinkleA = buildStars({ count: 380, rMin: 500, rMax: 1300, size: 3.4, opacity: 0.9,
    colorA: new THREE.Color(0xffffff), colorB: new THREE.Color(0xbfe8ff), brightChance: 0.5, map: softWhite, rotSpeed: 0.0015 });
  var twinkleB = buildStars({ count: 380, rMin: 500, rMax: 1300, size: 3.4, opacity: 0.9,
    colorA: new THREE.Color(0xfff3c4), colorB: new THREE.Color(0xffffff), brightChance: 0.5, map: softWhite, rotSpeed: 0.0022 });

  /* ======================================================================
     三、太阳系本体
     ====================================================================== */
  var SOLAR_POS = new THREE.Vector3(0, -30, -150);
  var solar = new THREE.Group();
  solar.position.copy(SOLAR_POS);
  scene.add(solar);
  sunLight.position.copy(SOLAR_POS);

  // —— 太阳：真实纹理 + 日冕壳 + 多层脉动光晕 ——
  var SUN_R = 19;
  var sunMat = new THREE.MeshBasicMaterial();
  applyTex(sunMat, '2k_sun.jpg', 'sun');
  var sun = new THREE.Mesh(new THREE.SphereGeometry(SUN_R, SEG, SEG), sunMat);
  solar.add(sun);

  var corona = new THREE.Mesh(
    new THREE.SphereGeometry(SUN_R * 1.16, SEG, SEG),
    new THREE.MeshBasicMaterial({ color: 0xffa843, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  solar.add(corona);

  function glowSprite(parent, color, size, opacity) {
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeSprite('rgba(' + color + ',1)', 'rgba(' + color + ',0.35)'),
      transparent: true, opacity: opacity, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    sp.scale.set(size, size, 1);
    parent.add(sp);
    return sp;
  }
  var sunGlows = [
    { sp: glowSprite(solar, '255,224,150', 110, 0.68), base: 110 },
    { sp: glowSprite(solar, '255,176,86', 175, 0.32), base: 175 },
    { sp: glowSprite(solar, '255,140,60', 270, 0.11), base: 270 },
    { sp: glowSprite(solar, '255,110,40', 380, 0.045), base: 380 }
  ];

  // —— 行星定义（file: 纹理文件名）——
  var GLOW_COLORS = {
    mercury: '170,160,150', venus: '240,205,150', earth: '90,170,255', mars: '235,120,70',
    jupiter: '230,180,120', saturn: '235,215,160', uranus: '130,225,235', neptune: '90,130,240'
  };

  var PLANETS = [
    { key: 'mercury', file: '2k_mercury.jpg',          size: 2.6,  orbit: 44,  speed: 0.52, tilt: 0.02 },
    { key: 'venus',   file: '2k_venus_atmosphere.jpg', size: 4.4,  orbit: 62,  speed: 0.38, tilt: 0.05 },
    { key: 'earth',   file: '2k_earth_daymap.jpg',     size: 4.8,  orbit: 82,  speed: 0.3,  tilt: 0.41, moon: true },
    { key: 'mars',    file: '2k_mars.jpg',             size: 3.6,  orbit: 102, speed: 0.25, tilt: 0.44 },
    { key: 'jupiter', file: '2k_jupiter.jpg',          size: 11.5, orbit: 142, speed: 0.15, tilt: 0.05 },
    { key: 'saturn',  file: '2k_saturn.jpg',           size: 9.6,  orbit: 184, speed: 0.11, tilt: 0.47, ring: true },
    { key: 'uranus',  file: '2k_uranus.jpg',           size: 6.4,  orbit: 218, speed: 0.085, tilt: 1.7 },
    { key: 'neptune', file: '2k_neptune.jpg',          size: 6.2,  orbit: 248, speed: 0.065, tilt: 0.49 }
  ];

  var planets = {};

  PLANETS.forEach(function (def) {
    var group = new THREE.Group();

    var mat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0.02 });
    applyTex(mat, def.file, def.key);
    var mesh = new THREE.Mesh(new THREE.SphereGeometry(def.size, SEG, Math.round(SEG * 0.7)), mat);
    mesh.rotation.z = def.tilt;
    group.add(mesh);

    // 大气辉光
    var atmo = glowSprite(group, GLOW_COLORS[def.key], def.size * 3.1, 0.15);

    // 土星环：真实 alpha 纹理
    if (def.ring) {
      var inR = def.size * 1.24, outR = def.size * 2.32;
      var ringGeo = new THREE.RingGeometry(inR, outR, 128);
      var posAttr = ringGeo.attributes.position, uvAttr = ringGeo.attributes.uv;
      var v3 = new THREE.Vector3();
      for (var vi = 0; vi < posAttr.count; vi++) {
        v3.fromBufferAttribute(posAttr, vi);
        uvAttr.setXY(vi, (v3.length() - inR) / (outR - inR), 0.5);
      }
      var ringMat = new THREE.MeshBasicMaterial({
        side: THREE.DoubleSide, transparent: true, opacity: 0.96, depthWrite: false, color: 0xfff2dc
      });
      applyTex(ringMat, '2k_saturn_ring_alpha.png', 'saturn');
      var ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2.2;
      group.add(ring);
    }

    // 月球
    if (def.moon) {
      var moonMat = new THREE.MeshStandardMaterial({ roughness: 0.95 });
      applyTex(moonMat, '2k_moon.jpg', 'moon');
      var moon = new THREE.Mesh(new THREE.SphereGeometry(1.3, 32, 24), moonMat);
      group.add(moon);
      group.userData.moonMesh = moon;
    }

    // 轨道线
    var orbitPts = [];
    for (var a = 0; a <= 160; a++) {
      var ang = (a / 160) * Math.PI * 2;
      orbitPts.push(new THREE.Vector3(Math.cos(ang) * def.orbit, 0, Math.sin(ang) * def.orbit));
    }
    var orbitLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(orbitPts),
      new THREE.LineBasicMaterial({ color: 0x7585e8, transparent: true, opacity: 0.28 })
    );
    solar.add(orbitLine);

    group.userData.def = def;
    group.userData.angle = Math.random() * Math.PI * 2;
    group.userData.mesh = mesh;
    group.userData.atmo = atmo;
    group.userData.orbitLine = orbitLine;
    group.userData.moonAngle = Math.random() * Math.PI * 2;
    solar.add(group);
    planets[def.key] = group;
  });

  // —— 小行星带 ——
  (function buildAsteroidBelt() {
    var n = Math.round(2000 * Q);
    var pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    var color = new THREE.Color();
    for (var i = 0; i < n; i++) {
      var r = 116 + Math.random() * 16 + (Math.random() < 0.08 ? Math.random() * 7 : 0);
      var ang = Math.random() * Math.PI * 2;
      pos[i * 3] = Math.cos(ang) * r;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 3.4;
      pos[i * 3 + 2] = Math.sin(ang) * r;
      color.setHSL(0.08 + Math.random() * 0.05, 0.18, 0.42 + Math.random() * 0.3);
      col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    var belt = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 1.5, map: softWhite, vertexColors: true, transparent: true,
      opacity: 0.85, depthWrite: false, sizeAttenuation: true
    }));
    belt.name = 'belt';
    solar.add(belt);
  })();
  var belt = solar.getObjectByName('belt');

  // —— 彗星 ——
  var comet = new THREE.Group();
  glowSprite(comet, '180,230,255', 11, 1);
  scene.add(comet);
  var COMET_TAIL_N = 28;
  var cometTail = [];
  for (var ci = 0; ci < COMET_TAIL_N; ci++) {
    var seg = new THREE.Sprite(new THREE.SpriteMaterial({
      map: softGlow, color: 0x9fdcff, transparent: true,
      opacity: 0.5 * (1 - ci / COMET_TAIL_N),
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    var ss = 7.5 * (1 - ci / COMET_TAIL_N) + 1.2;
    seg.scale.set(ss, ss, 1);
    scene.add(seg);
    cometTail.push(seg);
  }
  var cometHistory = [];

  function cometPos(t) {
    var T = (t % 40) / 40 * Math.PI * 2;
    return new THREE.Vector3(
      Math.cos(T) * 380,
      50 + Math.sin(T * 2) * 26,
      Math.sin(T) * 230
    ).add(SOLAR_POS);
  }

  /* ======================================================================
     四、章节系统：伴飞相机（镜头飞向行星，行星持续公转）
     ====================================================================== */
  var SECTIONS = [
    { id: 'hero',    planet: null },
    { id: 'stats',   planet: 'jupiter' },
    { id: 'works',   planet: 'mars' },
    { id: 'project', planet: 'earth' },
    { id: 'skills',  planet: 'saturn' },
    { id: 'contact', planet: 'mercury' }
  ];

  var sectionEls = SECTIONS.map(function (s) { return document.getElementById(s.id); });
  var current = 0;

  function findSection() {
    var mid = window.scrollY + window.innerHeight * 0.5;
    for (var i = sectionEls.length - 1; i >= 0; i--) {
      if (sectionEls[i] && mid >= sectionEls[i].offsetTop) return i;
    }
    return 0;
  }

  function updateTargets() {
    current = findSection();
    Object.keys(planets).forEach(function (k) {
      planets[k].userData.focused = (SECTIONS[current].planet === k);
    });
  }
  window.addEventListener('scroll', updateTargets, { passive: true });
  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    isMobile = window.innerWidth < 768;
    updateTargets();
  });
  updateTargets();

  // 鼠标 / 触摸
  var mouseX = 0, mouseY = 0, smX = 0, smY = 0;
  window.addEventListener('mousemove', function (e) {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });
  window.addEventListener('touchmove', function (e) {
    if (!e.touches[0]) return;
    mouseX = (e.touches[0].clientX / window.innerWidth - 0.5) * 2;
    mouseY = (e.touches[0].clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  /* ======================================================================
     五、渲染循环
     ====================================================================== */
  var clock = new THREE.Clock();
  var camPos = new THREE.Vector3(0, 130, 240);
  var camLook = SOLAR_POS.clone();
  var camPosT = new THREE.Vector3(), camLookT = new THREE.Vector3();
  var planetWorld = new THREE.Vector3(), sunWorld = new THREE.Vector3();
  var radial = new THREE.Vector3(), tangent = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  var fov = 62, fovT = 62;

  var ORBIT_R = 330, ORBIT_BASE_EL = 0.4;

  function render() {
    var t = clock.getElapsedTime();

    // 星空
    for (var i = 0; i < starLayers.length; i++) starLayers[i].rotation.y = t * starLayers[i].userData.rotSpeed;
    twinkleA.material.opacity = 0.22 + 0.68 * (0.5 + 0.5 * Math.sin(t * 1.7));
    twinkleB.material.opacity = 0.22 + 0.68 * (0.5 + 0.5 * Math.sin(t * 1.3 + 2.1));

    // 太阳
    sun.rotation.y = t * 0.035;
    corona.scale.setScalar(1 + 0.025 * Math.sin(t * 2.1));
    corona.material.opacity = 0.13 + 0.05 * (0.5 + 0.5 * Math.sin(t * 1.6));
    for (var gi = 0; gi < sunGlows.length; gi++) {
      var gg = sunGlows[gi];
      var pulse = 1 + 0.075 * Math.sin(t * 1.4 + gi * 1.8);
      gg.sp.scale.set(gg.base * pulse, gg.base * pulse, 1);
    }

    if (belt) belt.rotation.y = t * 0.016;

    // 行星公转 + 自转 + 月球
    Object.keys(planets).forEach(function (k) {
      var g = planets[k], ud = g.userData, def = ud.def;
      if (!prefersReduced) ud.angle += def.speed * 0.008;
      g.position.set(Math.cos(ud.angle) * def.orbit, 0, Math.sin(ud.angle) * def.orbit);
      ud.mesh.rotation.y += ud.focused ? 0.0042 : 0.0022;
      ud.atmo.material.opacity = 0.15 + (ud.focused ? 0.22 : 0);
      if (ud.moonMesh) {
        ud.moonAngle += 0.013;
        ud.moonMesh.position.set(Math.cos(ud.moonAngle) * 8.6, 1.2, Math.sin(ud.moonAngle) * 8.6);
        ud.moonMesh.rotation.y += 0.003;
      }
    });

    // 彗星
    var cp = cometPos(t);
    comet.position.copy(cp);
    cometHistory.unshift(cp.clone());
    if (cometHistory.length > COMET_TAIL_N * 2) cometHistory.pop();
    for (var ti = 0; ti < cometTail.length; ti++) {
      var h = cometHistory[Math.min(ti * 2, cometHistory.length - 1)];
      if (h) cometTail[ti].position.copy(h);
    }

    // ---- 相机 ----
    smX += (mouseX - smX) * 0.05;
    smY += (mouseY - smY) * 0.05;

    var sec = SECTIONS[current];

    if (!sec.planet) {
      // Hero：鼠标驾驶轨道相机，环绕太阳系全景
      var az = smX * 0.66;
      var el = ORBIT_BASE_EL - smY * 0.22;
      el = Math.max(0.1, Math.min(0.95, el));
      camPosT.set(
        SOLAR_POS.x + Math.sin(az) * Math.cos(el) * ORBIT_R,
        SOLAR_POS.y + Math.sin(el) * ORBIT_R,
        SOLAR_POS.z + Math.cos(az) * Math.cos(el) * ORBIT_R
      );
      camLookT.copy(SOLAR_POS);
      fovT = 62;
    } else {
      // 章节：伴飞行星 —— 相机停靠在行星外侧后上方，跟随公转
      var g2 = planets[sec.planet], def2 = g2.userData.def;
      g2.getWorldPosition(planetWorld);
      sunWorld.copy(SOLAR_POS);
      radial.copy(planetWorld).sub(sunWorld).normalize();
      tangent.crossVectors(UP, radial).normalize();

      var d = def2.size;
      if (isMobile) {
        // 手机：行星在画面上方
        camPosT.copy(planetWorld)
          .addScaledVector(radial, d * 3.6 + 5)
          .addScaledVector(UP, d * 1.2)
          .addScaledVector(tangent, d * 0.6);
        camLookT.copy(planetWorld).addScaledVector(UP, d * 1.5);
      } else {
        // 桌面：行星占画面右半，左侧留给内容
        camPosT.copy(planetWorld)
          .addScaledVector(radial, d * 3.3 + 5)
          .addScaledVector(UP, d * 0.95)
          .addScaledVector(tangent, d * 1.1);
        camLookT.copy(planetWorld).addScaledVector(tangent, -d * 1.35);
      }
      // 伴飞时的鼠标微视差
      camPosT.addScaledVector(tangent, smX * d * 0.45);
      camPosT.addScaledVector(UP, -smY * d * 0.3);
    }

    // 飞行插值 + FOV 冲刺感
    var dist = camPos.distanceTo(camPosT);
    fovT = (sec.planet ? 60 : 62) + Math.min(dist * 0.055, 16);
    camPos.lerp(camPosT, sec.planet ? 0.052 : 0.06);
    camLook.lerp(camLookT, 0.07);
    fov += (fovT - fov) * 0.06;
    camera.fov = fov;
    camera.updateProjectionMatrix();
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    camLight.position.copy(camera.position);

    renderer.render(scene, camera);
  }

  if (prefersReduced) {
    updateTargets();
    // 静态渲染若干帧让纹理就绪
    var staticTick = 0;
    var staticTimer = setInterval(function () {
      camPos.copy(camPosT.lengthSq() ? camPosT : camPos);
      camLook.copy(camLookT.lengthSq() ? camLookT : camLook);
      render();
      if (++staticTick > 30) clearInterval(staticTimer);
    }, 100);
    window.addEventListener('scroll', function () { updateTargets(); render(); }, { passive: true });
    window.addEventListener('resize', render);
  } else {
    renderer.setAnimationLoop(render);
  }
})();
