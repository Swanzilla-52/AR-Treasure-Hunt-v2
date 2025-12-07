import {
  AssetType,
  SessionMode,
  SRGBColorSpace,
  AssetManager,
  World,
  MeshBasicMaterial,
  LocomotionEnvironment,
  EnvironmentType,
  PanelUI,
  Interactable,
  ScreenSpace,
  PhysicsBody, 
  PhysicsShape, 
  PhysicsShapeType, 
  PhysicsState, 
  PhysicsSystem,
  createSystem,
  OneHandGrabbable,
  DoubleSide,
  CanvasTexture,
  PlaneGeometry,
  Mesh,
} from '@iwsdk/core';

import { PanelSystem } from './panel.js';
import { add } from 'three/tsl';

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
let tokenEntity = null;
let tokenExists = false;

World.create(document.getElementById('scene-container'), {
  assets,
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    offer: 'always',
    features: { handTracking: true, layers: false } 
  },
  features: { 
    locomotion: true,
    grabbing: true, 
    physics: true,
  },
}).then((world) => {
  const { camera } = world;
  
  world
    .registerSystem(PhysicsSystem)
    .registerComponent(PhysicsBody)
    .registerComponent(PhysicsShape);

  // ---- sounds ----
  const collectSound = new Audio('/audio/collect.mp3');
  const victorySound = new Audio('/audio/victory.mp3');

  // ---- SCOREBOARD SETUP ----
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 300;
  const ctx = canvas.getContext('2d');

  const texture = new CanvasTexture(canvas);
  const aspect = canvas.width / canvas.height;
  const boardWidth = 2;                 
  const boardHeight = boardWidth / aspect;
  
  const boardMat = new MeshBasicMaterial({ 
    map: texture, 
    transparent: true,  
    side: DoubleSide,
  });

  const boardGeo = new PlaneGeometry(12, 1.5);
  const boardMesh = new Mesh(boardGeo, boardMat);
  const boardEntity = world.createTransformEntity(boardMesh);

  boardEntity.object3D.position.set(0, 5, -20);  
  boardEntity.object3D.visible = true; 

  function updateScoreboard() {
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
      ctx.fillText('COLLECT THE COINS', canvas.width / 2, canvas.height / 2 + 40);
    }

    ctx.font = 'bold 120px sans-serif';
    ctx.fillStyle = 'green';
    ctx.textAlign = 'center';
    ctx.fillText(`COLLECTED: ${score}`, canvas.width / 2, canvas.height - 10);

    texture.needsUpdate = true;
  }
  updateScoreboard();

  // ---- TOKEN SPAWN ----
  function createToken() {
    // ✅ Get GLTF and clone its scene (this fixes the .clone error)
    const { scene: baseScene } = AssetManager.getGLTF('token');
    const tokenModel = baseScene.clone(true);

    tokenModel.scale.setScalar(1.0);

    const x = (Math.random() - 0.5) * 10;
    const y = 0.5;
    const z = (Math.random() - 0.5) * 10;
    tokenModel.position.set(x, y, z);

    const token = world.createTransformEntity(tokenModel);
    token.addComponent(Interactable);
    token.addComponent(OneHandGrabbable, {
      translate: true,
      rotate: true,
    });

    return token;
  }

  function collectToken() {
    if (!tokenExists || !tokenEntity || gameOver) return;

    tokenExists = false;

    // play collect sound
    collectSound.currentTime = 0;
    collectSound.play();

    // destroy current token
    tokenEntity.destroy();
    tokenEntity = null;

    // update score
    score += 1;
    updateScoreboard();

    // win condition
    if (score >= 10) {
      gameOver = true;
      updateScoreboard();
      victorySound.currentTime = 0;
      victorySound.play();
      return;
    }

    // spawn next token
    setTimeout(() => {
      if (!gameOver) {
        tokenEntity = createToken();
        tokenExists = true;
      }
    }, 200);
  }

  // ---- SYSTEM: check when player is "collecting" the token ----
  const TokenCollectSystem = class extends createSystem() {
    update(delta, time) {
      if (!tokenExists || !tokenEntity || gameOver) return;

      const tokenPos = tokenEntity.object3D.position;
      const playerPos = camera.position;

      const dx = tokenPos.x - playerPos.x;
      const dy = tokenPos.y - playerPos.y;
      const dz = tokenPos.z - playerPos.z;
      const distSq = dx*dx + dy*dy + dz*dz;

      const collectRadius = 0.4; // how close you need to be to "collect"
      if (distSq < collectRadius * collectRadius) {
        collectToken();
      }
    }
  };

  // spawn first token + system
  tokenEntity = createToken();
  tokenExists = true;

  world.registerSystem(TokenCollectSystem);

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
