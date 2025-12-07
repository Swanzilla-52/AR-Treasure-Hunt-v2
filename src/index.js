import {
  AssetType,
  SessionMode,
  SRGBColorSpace,
  AssetManager,
  World,
  MeshStandardMaterial,
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
  OneHandGrabbable
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

World.create(document.getElementById('scene-container'), {
  assets,
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    offer: 'always',
    // Optional structured features; layers/local-floor are offered by default
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

  const collectSound = new Audio('/audio/collect.mp3');
  const victorySound = new Audio('/audio/victory.mp3');

  const tokenModel = AssetManager.getGLTF('token').scene;
  tokenModel.scale.setScalar(1.0);

  for ( let i = 0; i < 5; i++){
    const clone = tokenModel.clone(true);

    const x = (Math.random() - 0.5) * 10;
    const y = 0.5;
    const z = (Math.random() - 0.5) * 10;

    clone.position.set(x, y, z);

    const token = world.createTransformEntity(clone);
    token.addComponent(Interactable).addComponent(OneHandGrabbable);
  }

  const GameLoopSystem = class extends createSystem() {
    update(delta, time) {

  };
  world.registerSystem(GameLoopSystem);



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
