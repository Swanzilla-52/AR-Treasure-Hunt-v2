

import {
  AssetType,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SessionMode,
  SRGBColorSpace,
  AssetManager,
  World,
  SphereGeometry,
  MeshStandardMaterial,
  LocomotionEnvironment,
  EnvironmentType,
  PanelUI,
  Interactable,
  ScreenSpace,
  PhysicsBody, PhysicsShape, PhysicsShapeType, PhysicsState, PhysicsSystem,
  createSystem
} from '@iwsdk/core';


import { PanelSystem } from './panel.js';


const assets = {
  chimeSound: {
    url: '/audio/chime.mp3',
    type: AssetType.Audio,
    priority: 'background'
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
  features: { locomotion: { useWorker: true }, grabbing: true, physics: true},
  level: '/glxf/Composition.glxf' 
}).then((world) => {
  const { camera } = world;
  
  // Create a green sphere
  const sphereGeometry = new SphereGeometry(0.25, 32, 32);
  const greenMaterial = new MeshStandardMaterial({ color: "red" });
  const sphere = new Mesh(sphereGeometry, greenMaterial);
  sphere.position.set(1, 1.5, -3);
  const sphereEntity = world.createTransformEntity(sphere);
  sphereEntity.addComponent(PhysicsShape, { shape: PhysicsShapeType.Auto,  density: 0.2,  friction: 0.5,  restitution: 0.9 });
  sphereEntity.addComponent(PhysicsBody, { state: PhysicsState.Dynamic });

  // create a floor
  const floorMesh = new Mesh(new PlaneGeometry(20, 20), new MeshStandardMaterial({color:"tan"}));
  floorMesh.rotation.x = -Math.PI / 2;
  const floorEntity = world.createTransformEntity(floorMesh);
  floorEntity.addComponent(LocomotionEnvironment, { type: EnvironmentType.STATIC });
  floorEntity.addComponent(PhysicsShape, { shape: PhysicsShapeType.Auto});
  floorEntity.addComponent(PhysicsBody, { state: PhysicsState.Static });

  let numBounces = 0;
  const GameLoopSystem = class extends createSystem() {
    update(delta, time) {
      //console.log(sphereEntity.object3D.position.y);
      if (sphereEntity.object3D.position.y < 0.27) {
          numBounces += 1;
          console.log(`Sphere has bounced ${numBounces} times`);
          //sphereEntity.destroy()
      }
    }
  };
  world.registerSystem(GameLoopSystem);


  
  world.registerSystem(PhysicsSystem).registerComponent(PhysicsBody).registerComponent(PhysicsShape);
  





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
