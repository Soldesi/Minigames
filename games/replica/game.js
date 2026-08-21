/* ==========================================================================
   RÉPLICA — lógica do jogo
   Memorize as peças que faltam no cubo, depois replique o padrão.
   ========================================================================== */

(function () {
  'use strict';

  // =======================================================================
  // 🎛️  CONFIGURAÇÕES GERAIS — mexa aqui para ajustar o jogo
  // =======================================================================

  var MAX_LIVES = 3;      // quantas vidas o jogador tem
  var UNIT = 0.86;         // tamanho visual de cada bloco (0 a 1)
  var SPACING = 1.0;       // distância entre os centros dos blocos (define o "vão" do cubo)
  var LOCKED_LEVELS = 3;   // até qual nível o cubo fica parado (sem girar) e só usa peças já visíveis

  // -----------------------------------------------------------------------
  // 🎨 CORES DOS BLOCOS (formato hexadecimal do three.js: 0xRRGGBB)
  // Estas cores são do CUBO 3D — não ficam no CSS, porque são desenhadas
  // pelo WebGL. As cores da INTERFACE (botões, textos, fundo da página)
  // estão em ../../style.css, dentro do bloco ":root { ... }".
  // -----------------------------------------------------------------------

  var COLOR_WOOD = 0xe4cfa5;        // cor única de todos os blocos (bege claro)
  var COLOR_SEAM = 0x4a3826;        // linha fina entre as faces de cada bloco (a "costura" do bloco)
  var COLOR_SEAM_OPACITY = 0.28;    // opacidade dessa linha (0 = invisível, 1 = sólida)

  // cores usadas SÓ no retângulo de feedback depois de confirmar a jogada
  // (acerto / erro / peça esquecida) — fora desse momento, nenhuma linha
  // extra aparece onde um bloco foi removido.
  var COLOR_SUCCESS = 0x5b8c4c;     // peça removida corretamente
  var COLOR_WARN = 0xc98a2e;        // peça que faltou remover
  var COLOR_DANGER = 0xc24b3f;      // peça removida por engano

  // =======================================================================
  // DOM
  // =======================================================================

  var canvas = document.getElementById('cube-canvas');
  var stage = document.querySelector('.stage');
  var hudLevel = document.getElementById('hud-level');
  var hudLives = document.getElementById('hud-lives');
  var hudScore = document.getElementById('hud-score');
  var phaseBanner = document.getElementById('phase-banner');
  var timerRing = document.getElementById('timer-ring');
  var timerRingFill = document.getElementById('timer-ring-fill');
  var hint = document.getElementById('hint');
  var btnConfirm = document.getElementById('btn-confirm');
  var btnResetView = document.getElementById('btn-reset-view');
  var btnResetAttempt = document.getElementById('btn-reset-attempt');
  var modalStart = document.getElementById('modal-start');
  var modalGameover = document.getElementById('modal-gameover');
  var btnStart = document.getElementById('btn-start');
  var btnRetry = document.getElementById('btn-retry');
  var finalScoreEl = document.getElementById('final-score');
  var finalLevelEl = document.getElementById('final-level');
  var gameoverTitle = document.getElementById('gameover-title');

  var RING_R = 19;
  var RING_C = 2 * Math.PI * RING_R;
  timerRingFill.style.strokeDasharray = RING_C.toFixed(2);
  timerRingFill.style.strokeDashoffset = '0';

  var DEFAULT_CAM_POS = { x: 3.4, y: 2.7, z: 3.8 };

  // =======================================================================
  // Three.js — cena, câmera, luzes, controles
  // =======================================================================

  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  var scene = new THREE.Scene();
  scene.background = null; // transparente: quem aparece por trás é o fundo do .stage (ver game.css)

  var camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(DEFAULT_CAM_POS.x, DEFAULT_CAM_POS.y, DEFAULT_CAM_POS.z);

  // luzes: só afetam o sombreamento dos blocos, não têm cor "de destaque"
  var ambient = new THREE.AmbientLight(0xfff3e0, 0.68);
  scene.add(ambient);
  var key = new THREE.DirectionalLight(0xfffaf0, 0.85);
  key.position.set(4, 6, 5);
  scene.add(key);
  var fillLight = new THREE.DirectionalLight(0xffe9c8, 0.28);
  fillLight.position.set(-4, 1, -3);
  scene.add(fillLight);

  var cubeGroup = new THREE.Group();
  scene.add(cubeGroup);

  var controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.enablePan = false;
  controls.minDistance = 2.6;
  controls.maxDistance = 8;
  controls.rotateSpeed = 0.7;
  controls.target.set(0, 0, 0);

  function resetCameraView() {
    camera.position.set(DEFAULT_CAM_POS.x, DEFAULT_CAM_POS.y, DEFAULT_CAM_POS.z);
    controls.target.set(0, 0, 0);
    controls.update();
  }

  function resize() {
    var w = stage.clientWidth;
    var h = stage.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  // =======================================================================
  // Tween helper — animação de "pop" (aparecer/sumir) dos blocos
  // =======================================================================

  function easeOutBack(t) {
    var c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
  function easeInCubic(t) { return t * t * t; }

  function pop(mesh, show, duration) {
    duration = duration || 220;
    if (show) mesh.visible = true;
    var start = performance.now();
    var from = show ? 0.001 : 1;
    var to = show ? 1 : 0.001;
    function step(now) {
      var t = Math.min(1, (now - start) / duration);
      var eased = show ? easeOutBack(t) : easeInCubic(t);
      var s = from + (to - from) * eased;
      mesh.scale.setScalar(Math.max(0.001, s));
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        mesh.scale.setScalar(show ? 1 : 0.001);
        if (!show) mesh.visible = false;
      }
    }
    requestAnimationFrame(step);
  }

  // =======================================================================
  // Cubo — construção e estado de cada célula
  //
  // Cada célula tem 3 "camadas":
  //  - solidMesh: o bloco de madeira visível (usa COLOR_WOOD)
  //  - ghostMesh: contorno usado SÓ para o feedback de acerto/erro depois
  //    de confirmar — fica invisível durante o jogo normal
  //  - hitMesh:   uma caixa invisível maior, só para detectar o toque
  // =======================================================================

  var cells = [];       // células visíveis (casca do cubo) da rodada atual
  var gridSize = 3;

  function disposeCube() {
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      cubeGroup.remove(c.group);
      c.solidMesh.geometry.dispose();
      c.solidMesh.material.dispose();
      c.edges.geometry.dispose();
      c.edges.material.dispose();
      c.ghostMesh.geometry.dispose();
      c.ghostMesh.material.dispose();
      c.hitMesh.geometry.dispose();
      c.hitMesh.material.dispose();
    }
    cells = [];
  }

  function buildCube(n) {
    disposeCube();
    gridSize = n;
    var offset = (n - 1) / 2;
    var id = 0;

    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        for (var k = 0; k < n; k++) {
          // só cria blocos na casca do cubo (os de dentro nunca aparecem)
          var isShell = (i === 0 || i === n - 1 || j === 0 || j === n - 1 || k === 0 || k === n - 1);
          if (!isShell) continue;

          var group = new THREE.Group();
          group.position.set(
            (i - offset) * SPACING,
            (j - offset) * SPACING,
            (k - offset) * SPACING
          );

          // --- bloco sólido (a cor de todos os blocos vem de COLOR_WOOD lá em cima) ---
          var solidGeo = new THREE.BoxGeometry(UNIT, UNIT, UNIT);
          var solidMat = new THREE.MeshStandardMaterial({ color: COLOR_WOOD, roughness: 0.85, metalness: 0.02 });
          var solidMesh = new THREE.Mesh(solidGeo, solidMat);
          group.add(solidMesh);

          // --- linha fina de "costura" nas bordas do bloco (COLOR_SEAM) ---
          var edgesGeo = new THREE.EdgesGeometry(solidGeo);
          var edgesMat = new THREE.LineBasicMaterial({ color: COLOR_SEAM, transparent: true, opacity: COLOR_SEAM_OPACITY });
          var edges = new THREE.LineSegments(edgesGeo, edgesMat);
          solidMesh.add(edges);

          // --- contorno "fantasma": só aparece no feedback pós-confirmação ---
          var ghostGeo = new THREE.BoxGeometry(UNIT * 0.8, UNIT * 0.8, UNIT * 0.8);
          var ghostEdgesGeo = new THREE.EdgesGeometry(ghostGeo);
          var ghostMat = new THREE.LineBasicMaterial({ color: COLOR_SUCCESS, transparent: true, opacity: 0.7 });
          var ghostMesh = new THREE.LineSegments(ghostEdgesGeo, ghostMat);
          ghostMesh.visible = false;
          group.add(ghostMesh);

          // --- área de toque (invisível, um pouco maior que o bloco) ---
          var hitGeo = new THREE.BoxGeometry(SPACING * 0.92, SPACING * 0.92, SPACING * 0.92);
          var hitMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
          var hitMesh = new THREE.Mesh(hitGeo, hitMat);
          group.add(hitMesh);

          cubeGroup.add(group);

          var cell = {
            id: id++,
            i: i, j: j, k: k,
            group: group,
            solidMesh: solidMesh,
            edges: edges,
            ghostMesh: ghostMesh,
            hitMesh: hitMesh,
            removed: false
          };
          hitMesh.userData.cell = cell;
          cells.push(cell);
        }
      }
    }
  }

  // mostra/esconde o bloco sólido (com ou sem animação de pop)
  function setCellSolid(cell, visible, animated) {
    cell.removed = !visible;
    if (animated) {
      pop(cell.solidMesh, visible);
    } else {
      cell.solidMesh.visible = visible;
      cell.solidMesh.scale.setScalar(visible ? 1 : 0.001);
    }
  }

  // mostra/esconde o contorno "fantasma" — usado só para feedback (acerto/erro)
  function setCellGhost(cell, visible, colorHex, opacity, animated) {
    cell.ghostMesh.material.color.setHex(colorHex !== undefined ? colorHex : COLOR_SUCCESS);
    cell.ghostMesh.material.opacity = opacity !== undefined ? opacity : 0.7;
    if (animated) {
      pop(cell.ghostMesh, visible, 180);
    } else {
      cell.ghostMesh.visible = visible;
      cell.ghostMesh.scale.setScalar(visible ? 1 : 0.001);
    }
  }

  // =======================================================================
  // Estado do jogo
  // =======================================================================

  var state = {
    level: 1,
    lives: MAX_LIVES,
    score: 0,
    phase: 'idle',     // idle | preview | memorize | reset | replicate | checking | round_end
    target: null,      // Set de cell.id que devem ficar removidos
    current: null      // Set de cell.id que o jogador removeu até agora
  };

  var pendingTimers = [];
  function clearTimers() {
    pendingTimers.forEach(function (t) { clearTimeout(t); });
    pendingTimers = [];
  }
  function after(ms, fn) {
    var t = setTimeout(fn, ms);
    pendingTimers.push(t);
    return t;
  }

  function isLockedLevel(level) {
    return level <= LOCKED_LEVELS;
  }

  // dificuldade por nível: tamanho do cubo, quantas peças somem, tempo de memorização
  function difficultyFor(level) {
    var size = level <= 7 ? 3 : 4;
    var missing;
    if (size === 3) {
      missing = Math.min(10, 2 + level);
    } else {
      missing = Math.min(18, 6 + (level - 8));
    }
    var memorizeSeconds = Math.max(3, 7 - (level - 1) * 0.35);
    return { size: size, missing: missing, memorizeSeconds: memorizeSeconds };
  }

  function cellById(id) {
    for (var i = 0; i < cells.length; i++) if (cells[i].id === id) return cells[i];
    return null;
  }

  // células visíveis a partir do ângulo padrão da câmera, sem precisar girar
  // (usado nos níveis "travados", ver LOCKED_LEVELS lá em cima)
  function visiblePoolIds(n) {
    var ids = [];
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      if (c.i === n - 1 || c.j === n - 1 || c.k === n - 1) ids.push(c.id);
    }
    return ids;
  }

  function pickTarget(count, poolIds) {
    var pool = poolIds.slice();
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
    return new Set(pool.slice(0, Math.min(count, pool.length)));
  }

  // =======================================================================
  // HUD
  // =======================================================================

  function updateHud() {
    hudLevel.textContent = 'Nível ' + state.level;
    hudScore.textContent = String(state.score);
    var hearts = '';
    for (var i = 0; i < MAX_LIVES; i++) {
      hearts += '<span class="heart' + (i < state.lives ? '' : ' lost') + '">♥</span>';
    }
    hudLives.innerHTML = hearts;
  }

  function setBanner(text, tone) {
    phaseBanner.textContent = text;
    phaseBanner.className = 'phase-banner show' + (tone ? ' tone-' + tone : '');
  }
  function hideBanner() {
    phaseBanner.className = 'phase-banner';
  }

  function showHint(text) {
    hint.textContent = text;
    hint.classList.add('show');
  }
  function hideHint() {
    hint.classList.remove('show');
  }

  function startRing(seconds) {
    timerRingFill.style.transition = 'none';
    timerRingFill.style.strokeDashoffset = '0';
    timerRing.classList.add('show');
    // força reflow para garantir que a transição a seguir seja aplicada
    void timerRingFill.getBoundingClientRect();
    requestAnimationFrame(function () {
      timerRingFill.style.transition = 'stroke-dashoffset ' + seconds + 's linear';
      timerRingFill.style.strokeDashoffset = String(RING_C);
    });
  }
  function stopRing() {
    timerRing.classList.remove('show');
  }

  // habilita/desabilita os botões que só fazem sentido durante a fase de réplica
  function setReplicateControlsEnabled(enabled) {
    btnConfirm.disabled = !enabled;
    btnResetAttempt.disabled = !enabled;
  }

  // =======================================================================
  // Fluxo de rodada
  // =======================================================================

  function newRound() {
    clearTimers();
    setReplicateControlsEnabled(false);
    hideHint();
    stopRing();

    var diff = difficultyFor(state.level);
    var locked = isLockedLevel(state.level);

    resetCameraView();
    controls.enableRotate = !locked;
    canvas.classList.toggle('rotate-locked', locked);

    if (gridSize !== diff.size || cells.length === 0) {
      buildCube(diff.size);
    } else {
      cells.forEach(function (c) {
        setCellSolid(c, true, false);
        setCellGhost(c, false, COLOR_SUCCESS, 0.7, false);
      });
    }

    var poolIds = locked ? visiblePoolIds(diff.size) : cells.map(function (c) { return c.id; });
    state.target = pickTarget(diff.missing, poolIds);
    state.current = new Set();
    state.phase = 'preview';
    updateHud();
    setBanner('Observe o cubo', 'accent');

    after(900, function () { runMemorizePhase(diff.memorizeSeconds); });
  }

  function runMemorizePhase(seconds) {
    state.phase = 'memorize';
    setBanner('Memorize!', 'accent');
    startRing(seconds);

    // as peças do padrão somem — sem deixar nenhum contorno no lugar
    state.target.forEach(function (id) {
      setCellSolid(cellById(id), false, true);
    });

    after(seconds * 1000, function () { resetToFullPhase(); });
  }

  function resetToFullPhase() {
    state.phase = 'reset';
    stopRing();
    setBanner('Recompondo…', 'accent');

    state.target.forEach(function (id) {
      setCellSolid(cellById(id), true, true);
    });

    after(550, function () { startReplicatePhase(); });
  }

  var hintShownLocked = false;
  var hintShownUnlocked = false;
  function startReplicatePhase() {
    state.phase = 'replicate';
    setBanner('Sua vez — replique', 'accent');
    setReplicateControlsEnabled(true);

    if (isLockedLevel(state.level)) {
      if (!hintShownLocked) {
        showHint('toque num bloco para remover');
        hintShownLocked = true;
      }
    } else if (!hintShownUnlocked) {
      showHint('agora dá pra girar: arraste para virar o cubo e toque nos blocos');
      hintShownUnlocked = true;
    }
  }

  function onConfirm() {
    if (state.phase !== 'replicate') return;
    state.phase = 'checking';
    setReplicateControlsEnabled(false);
    hideHint();

    var missed = [];
    var extra = [];
    state.target.forEach(function (id) { if (!state.current.has(id)) missed.push(id); });
    state.current.forEach(function (id) { if (!state.target.has(id)) extra.push(id); });

    if (missed.length === 0 && extra.length === 0) {
      onSuccess();
    } else {
      onFail(missed, extra);
    }
  }

  function onSuccess() {
    setBanner('Perfeito!', 'success');
    // feedback visual: contorno verde nas peças certas (só nesse momento)
    state.target.forEach(function (id) {
      setCellGhost(cellById(id), true, COLOR_SUCCESS, 0.7, false);
    });
    state.score += state.level * 100;
    state.level += 1;
    updateHud();
    after(1300, function () { newRound(); });
  }

  function onFail(missed, extra) {
    setBanner('Quase lá', 'danger');

    // peças que o jogador esqueceu de remover: somem agora e ficam marcadas em âmbar
    missed.forEach(function (id) {
      var cell = cellById(id);
      setCellSolid(cell, false, true);
      setCellGhost(cell, true, COLOR_WARN, 0.75, true);
    });
    // peças removidas por engano: ficam marcadas em vermelho
    extra.forEach(function (id) {
      setCellGhost(cellById(id), true, COLOR_DANGER, 0.75, false);
    });
    // peças removidas corretamente: ficam marcadas em verde
    state.target.forEach(function (id) {
      if (missed.indexOf(id) === -1 && extra.indexOf(id) === -1 && state.current.has(id)) {
        setCellGhost(cellById(id), true, COLOR_SUCCESS, 0.6, false);
      }
    });

    state.lives -= 1;
    updateHud();

    // depois de um instante, as peças removidas por engano voltam ao lugar
    after(1100, function () {
      extra.forEach(function (id) {
        var cell = cellById(id);
        setCellGhost(cell, false, COLOR_DANGER, 0.75, true);
        setCellSolid(cell, true, true);
      });
    });

    after(2300, function () {
      if (state.lives <= 0) {
        gameOver();
      } else {
        newRound();
      }
    });
  }

  function gameOver() {
    state.phase = 'gameover';
    hideBanner();
    stopRing();
    finalScoreEl.textContent = String(state.score);
    finalLevelEl.textContent = String(state.level);
    gameoverTitle.textContent = 'Sem vidas';
    modalGameover.classList.remove('hidden');
  }

  // =======================================================================
  // Interação — arrastar gira (quando liberado), toque curto seleciona bloco
  // =======================================================================

  var raycaster = new THREE.Raycaster();
  var pointerStart = null;

  function ndcFromEvent(e) {
    var rect = renderer.domElement.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((e.clientY - rect.top) / rect.height) * 2 + 1
    };
  }

  canvas.addEventListener('pointerdown', function (e) {
    pointerStart = { x: e.clientX, y: e.clientY, t: performance.now() };
  });

  canvas.addEventListener('pointerup', function (e) {
    if (!pointerStart) return;
    var dx = e.clientX - pointerStart.x;
    var dy = e.clientY - pointerStart.y;
    var dt = performance.now() - pointerStart.t;
    pointerStart = null;

    if (Math.hypot(dx, dy) > 6 || dt > 500) return; // foi um arrasto, não um toque
    if (state.phase !== 'replicate') return;

    var ndc = ndcFromEvent(e);
    raycaster.setFromCamera(ndc, camera);
    var hitMeshes = cells.map(function (c) { return c.hitMesh; });
    var intersects = raycaster.intersectObjects(hitMeshes);
    if (intersects.length === 0) return;

    var cell = intersects[0].object.userData.cell;
    toggleCell(cell);
  });

  // remove ou devolve um bloco ao tocar nele — sem deixar contorno no vazio
  function toggleCell(cell) {
    if (state.current.has(cell.id)) {
      state.current.delete(cell.id);
      setCellSolid(cell, true, true);
    } else {
      state.current.add(cell.id);
      setCellSolid(cell, false, true);
    }
  }

  // botão "Redefinir": desfaz tudo o que o jogador já removeu nessa rodada,
  // sem contar como erro — útil se ele perceber que errou o caminho
  function resetAttempt() {
    if (state.phase !== 'replicate') return;
    state.current.forEach(function (id) {
      setCellSolid(cellById(id), true, true);
    });
    state.current.clear();
  }

  btnResetView.addEventListener('click', resetCameraView);
  btnResetAttempt.addEventListener('click', resetAttempt);
  btnConfirm.addEventListener('click', onConfirm);

  // =======================================================================
  // Início / reinício
  // =======================================================================

  function resetGame() {
    state.level = 1;
    state.lives = MAX_LIVES;
    state.score = 0;
    updateHud();
    gridSize = 0; // força reconstrução no primeiro newRound
    newRound();
  }

  btnStart.addEventListener('click', function () {
    modalStart.classList.add('hidden');
    resetGame();
  });

  btnRetry.addEventListener('click', function () {
    modalGameover.classList.add('hidden');
    resetGame();
  });

  updateHud();

  // observa o tamanho do palco para manter o canvas ajustado
  if (window.ResizeObserver) {
    new ResizeObserver(resize).observe(stage);
  }

}());
