import * as THREE from "three";

import { layers } from "../constants";

/**
 * The shared camera. `Controller` flies it — position, look-at and FOV are all
 * driven per frame by the scroll's progress through the three scene forms — so
 * the values below are only where it starts: the galaxy's framing.
 *
 * `far` has to reach the starfield, which hangs on a shell up to 230 units out
 * while the camera sits back at 56 over the maelstrom. The old 80 was set when
 * the camera never left z = 3 and nothing in the scene was more than a few units
 * across; at that value the entire sky would clip away.
 */
class Camera {
  readonly instance: THREE.PerspectiveCamera;

  constructor(scene: THREE.Scene) {
    this.instance = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      600,
    );
    this.instance.position.set(0, 0, 15);
    this.instance.layers.enable(layers.TORUS_SCENE);
    scene.add(this.instance);
  }

  resize() {
    this.instance.aspect = window.innerWidth / window.innerHeight;
    this.instance.updateProjectionMatrix();
  }
}

export default Camera;
