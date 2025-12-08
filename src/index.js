import {
  AssetType,
  SessionMode,
  SRGBColorSpace,
  AssetManager,
  World,
  MeshBasicMaterial,
  Interactable,
  CanvasTexture,
  PlaneGeometry,
  Mesh,
  DoubleSide,
  createSystem,
  Vector3,
} from '@iwsdk/core';

import { PanelSystem } from './panel.js'; // fine to keep, even if unused
import { add } from 'three/tsl';

// ---- assets ----
const assets = {
  token: {
    url: '/gltf/interesting_coin.glb',
    type: AssetType.GLTF,
    priority: 'critical',
  },
  collectSound: {
    url: '/audio/collect.mp3',
    type: AssetType.Audio,
    priority: 'critical',
  },
  victorySound: {
    url: '/audio/victory.mp3',
    type: AssetType.Audio,
    priority: 'critical',
  },
};

// ---- game state (global) ----
let score = 0;
let gameOver = false;
const activeTokens = [];

// ---- timer state (global) ----
let timerStarted = false;
let timerFinished = false;
let timerStartMs = 0;
let timerCurrentMs = 0;

World.create(document.getElementById('scene-container'), {
  assets,
  xr: {
    sessionMode: SessionMode.ImmersiveAR, // AR instead of VR
    offer: 'always',
    features: { handTracking: true, layers: false },
  },
  features: {
    grabbing: true, // no locomotion/physics; AR uses real movement
  },
}).then((world) => {
  const { camera } = world;

  // ---------- OPTIONAL "GROUND" (fully transparent) ----------
  // This just gives you a reference plane if you ever want it.
  // It is invisible in AR but could be used for placing things.
  const groundGeo = new PlaneGeometry(40, 40);
  const groundMat = new MeshBasicMaterial({
    color: 0x228b22,
    side: DoubleSide,
    transparent: true,
    opacity: 0.0, // 0 = fully invisible
  });

  const groundMesh = new Mesh(groundGeo, groundMat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.set(0, 0, 0);
  world.createTransformEntity(groundMesh);

  // ---------- sounds ----------
  const collectSound = new Audio('/audio/collect.mp3');
  const victorySound = new Audio('/audio/victory.mp3');

  // ---------- SCOREBOARD SETUP ----------
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 300;
  const ctx = canvas.getContext('2d');

  const texture = new CanvasTexture(canvas);

  const boardMat = new MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: DoubleSide,
  });

  const boardGeo = new PlaneGeometry(1.8, 0.25); // smaller for AR
  const boardMesh = new Mesh(boardGeo, boardMat);
  const boardEntity = world.createTransformEntity(boardMesh);

  // Put scoreboard about 1.2m high and 2m in front of camera origin
  boardEntity.object3D.position.set(0, 1.2, -2);
  boardEntity.object3D.visible = true;

  function updateScoreboard() {
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (gameOver) {
      ctx.font = 'bold 200px sans-serif';
      ctx.fillStyle = 'red';
      ctx.textAlign = 'center';
      ctx.fillText('YOU WIN', canvas.width / 2, canvas.height / 2 + 50);
    } else {
      ctx.font = 'bold 150px sans-serif';
      ctx.fillStyle = 'green';
      ctx.textAlign = 'center';
      ctx.fillText(
        'COLLECT THE COINS',
        canvas.width / 2,
        canvas.height / 2 + 40
      );
    }

    ctx.font = 'bold 120px sans-serif';
    ctx.fillStyle = 'green';
    ctx.textAlign = 'center';
    ctx.fillText(`COLLECTED: ${score}`, canvas.width / 2, canvas.height - 10);

    texture.needsUpdate = true;
  }
  updateScoreboard();

  // ---------- SKY TIMER SETUP ----------
  const timerCanvas = document.createElement('canvas');
  timerCanvas.width = 1024;
  timerCanvas.height = 256;
  const timerCtx = timerCanvas.getContext('2d');

  const timerTexture = new CanvasTexture(timerCanvas);

  const timerMat = new MeshBasicMaterial({
    map: timerTexture,
    transparent: true,
    side: DoubleSide,
  });

  const timerGeo = new PlaneGeometry(1.8, 0.35);
  const timerMesh = new Mesh(timerGeo, timerMat);
  const timerEntity = world.createTransformEntity(timerMesh);

  // Slightly above the scoreboard
  timerEntity.object3D.position.set(0, 1.6, -2.1);
  timerEntity.object3D.visible = true;

  function formatTime(ms) {
    const totalSeconds = ms / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds - minutes * 60;
    const minStr = String(minutes).padStart(2, '0');
    const secStr = seconds.toFixed(2).padStart(5, '0'); // e.g. "07.32"
    return `${minStr}:${secStr}`;
  }

  function updateTimerBoard() {
    if (!timerCtx) return;

    timerCtx.clearRect(0, 0, timerCanvas.width, timerCanvas.height);

    timerCtx.font = 'bold 120px sans-serif';
    timerCtx.fillStyle = 'green';
    timerCtx.textAlign = 'center';

    if (!timerStarted) {
      timerCtx.fillText(
        'TIME: 00:00.00',
        timerCanvas.width / 2,
        timerCanvas.height / 2 + 40
      );
    } else {
      const displayMs = timerFinished
        ? timerCurrentMs
        : Date.now() - timerStartMs;

      const timeText = `TIME: ${formatTime(displayMs)}`;
      timerCtx.fillText(
        timeText,
        timerCanvas.width / 2,
        timerCanvas.height / 2 + 40
      );
    }

    timerTexture.needsUpdate = true;
  }

  updateTimerBoard();

  // ---------- TIMER UPDATE SYSTEM ----------
  const TimerSystem = class extends createSystem() {
    update(delta, time) {
      if (!timerStarted || timerFinished) return;
      timerCurrentMs = Date.now() - timerStartMs;
      updateTimerBoard();
    }
  };
  world.registerSystem(TimerSystem);

  // ---------- TOKEN SPAWN ----------
  function createToken() {
    const gltf = AssetManager.getGLTF('token');
    const baseScene = gltf.scene;
    const tokenModel = baseScene.clone(true);

    tokenModel.scale.setScalar(0.4); // smaller for AR

    // Spawn within a small region in front of the camera origin
    const x = (Math.random() - 0.5) * 1.5; // -0.75 to 0.75m horizontally
    const y = 0.5 + Math.random() * 0.5;   // 0.5–1.0m high
    const z = -1.5 - Math.random();        // 1.5–2.5m in front
    tokenModel.position.set(x, y, z);

    const entity = world.createTransformEntity(tokenModel);

    // Allow grabbing if you want
    entity.addComponent(Interactable);

    tokenModel.userData = tokenModel.userData || {};
    tokenModel.userData.entity = entity;

    activeTokens.push(entity);

    console.log('Spawned token at', x, y, z);

    return entity;
  }

  // ---------- CORE COLLECTION LOGIC FOR ONE TOKEN ----------
  function collectSpecificToken(entity) {
    if (gameOver) return;
    if (!entity || entity.destroyed) return;

    // remove from active list
    const idx = activeTokens.indexOf(entity);
    if (idx !== -1) {
      activeTokens.splice(idx, 1);
    }

    // play collect sound
    collectSound.currentTime = 0;
    collectSound.play();

    // destroy safely on next tick
    setTimeout(() => {
      if (!entity.destroyed) {
        entity.destroy();
      }
    }, 0);

    // update score
    score += 1;
    console.log('Collected token, score =', score);
    updateScoreboard();

    // ---- TIMER HOOKS ----
    // start timer when first coin is collected
    if (score === 1 && !timerStarted) {
      timerStarted = true;
      timerFinished = false;
      timerStartMs = Date.now();
      timerCurrentMs = 0;
      updateTimerBoard();
    }

    // stop timer when fifth coin is collected
    if (score === 5 && timerStarted && !timerFinished) {
      timerFinished = true;
      timerCurrentMs = Date.now() - timerStartMs;
      updateTimerBoard(); // freeze time
    }
    // ----------------------

    // win condition at 10 coins
    if (score >= 5) {
      gameOver = true;
      updateScoreboard();
      victorySound.currentTime = 0;
      victorySound.play();
      return;
    }

    // spawn a replacement
    setTimeout(() => {
      if (!gameOver) {
        createToken();
      }
    }, 200);
  }

  // ---------- COLLISION SYSTEM: CAMERA vs ALL TOKENS ----------
  const _playerPos = new Vector3();
  const _tokenPos = new Vector3();

  const CoinCollectSystem = class extends createSystem() {
    update(delta, time) {
      if (gameOver) return;
      if (activeTokens.length === 0) return;

      // world position of camera (player)
      camera.getWorldPosition(_playerPos);

      const radius = 0.4; // ~40cm radius
      const radiusSq = radius * radius;

      for (let i = 0; i < activeTokens.length; i++) {
        const entity = activeTokens[i];
        if (!entity || entity.destroyed) continue;

        entity.object3D.getWorldPosition(_tokenPos);

        const dx = _tokenPos.x - _playerPos.x;
        const dy = _tokenPos.y - _playerPos.y;
        const dz = _tokenPos.z - _playerPos.z;
        const distSq = dx * dx + dy * dy + dz * dz;

        if (distSq < radiusSq) {
          console.log('Collision: collecting token');
          collectSpecificToken(entity);
          break; // only one per frame
        }
      }
    }
  };

  world.registerSystem(CoinCollectSystem);

  // ---------- INITIAL TOKEN ----------
  createToken();

  // vvvvvvvv EVERYTHING BELOW WAS ADDED TO DISPLAY A BUTTON TO ENTER VR FOR QUEST 1 DEVICES vvvvvv
  //          (for some reason IWSDK doesn't show Enter VR button on Quest 1)
  world.registerSystem(PanelSystem);
  
  if (isMetaQuest1()) {
    const panelEntity = world
      .createTransformEntity()
      .addComponent(PanelUI, {
        config: '/ui/welcome.json',
        maxHeight: 0.8,
        maxWidth: 1.6
      })
      .addComponent(Interactable)
      .addComponent(ScreenSpace, {
        top: '20px',
        left: '20px',
        height: '40%'
      });
    panelEntity.object3D.position.set(0, 1.29, -1.9);
  } else {
    // Skip panel on non-Meta-Quest-1 devices
    // Useful for debugging on desktop or newer headsets.
    console.log('Panel UI skipped: not running on Meta Quest 1 (heuristic).');
  }
  function isMetaQuest1() {
    try {
      const ua = (navigator && (navigator.userAgent || '')) || '';
      const hasOculus = /Oculus|Quest|Meta Quest/i.test(ua);
      const isQuest2or3 = /Quest\s?2|Quest\s?3|Quest2|Quest3|MetaQuest2|Meta Quest 2/i.test(ua);
      return hasOculus && !isQuest2or3;
    } catch (e) {
      return false;
    }
  }
});
