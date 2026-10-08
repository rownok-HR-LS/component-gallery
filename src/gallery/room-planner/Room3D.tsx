"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { openingSpan, type Item, type Plan } from "./plan";
import styles from "./RoomPlanner.module.css";

const WALL_T = 0.1; // metres
const DOOR_H = 2.1;
const SILL = 0.9;
const EYE = 1.6;

type Props = { plan: Plan; selected: string | null; dark: boolean };

function mat(color: string, opts: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.02, ...opts });
}

function box<M extends THREE.Material>(w: number, h: number, d: number, material: M, x = 0, y = h / 2, z = 0) {
  const mesh = new THREE.Mesh<THREE.BoxGeometry, M>(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function shade(color: string, amount: number) {
  return `#${new THREE.Color(color).offsetHSL(0, 0, amount).getHexString()}`;
}

function legs(group: THREE.Group, w: number, d: number, h: number, material: THREE.Material, size = 0.045) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) group.add(box(size, h, size, material, sx * (w / 2 - size), h / 2, sz * (d / 2 - size)));
}

/** Simple, recognisable 3D furniture built from boxes, in metres, centred on the origin. */
function furniture(it: Item): THREE.Group {
  const g = new THREE.Group();
  const w = it.w / 100;
  const d = it.d / 100;
  const h = Math.max(it.h / 100, 0.01);
  const main = mat(it.color);
  const dark = mat(shade(it.color, -0.1));
  const light = mat(shade(it.color, 0.25));
  switch (it.kind) {
    case "bed": {
      const fabric = mat("#f3efe8");
      g.add(box(w, h * 0.55, d, main));
      g.add(box(w * 0.96, 0.2, d * 0.94, fabric, 0, h * 0.55 + 0.1, 0.02));
      g.add(box(w, 1.0, 0.07, dark, 0, 0.5, -d / 2 + 0.035));
      g.add(box(w * 0.96, 0.05, d * 0.55, mat("#7e9bb8"), 0, h * 0.55 + 0.225, d * 0.2));
      for (const sx of w > 1.2 ? [-1, 1] : [0]) g.add(box(Math.min(0.55, w * 0.4), 0.12, 0.32, fabric, sx * w * 0.24, h * 0.55 + 0.26, -d / 2 + 0.3));
      break;
    }
    case "wardrobe":
    case "dresser": {
      g.add(box(w, h, d, main));
      const seams = it.kind === "wardrobe" ? Math.max(2, Math.round(w / 0.5)) : 1;
      for (let i = 1; i < seams; i++) g.add(box(0.008, h * 0.96, 0.01, dark, -w / 2 + (w / seams) * i, h / 2, d / 2 + 0.005));
      if (it.kind === "dresser") for (let i = 1; i < 3; i++) g.add(box(w * 0.96, 0.008, 0.01, dark, 0, (h / 3) * i, d / 2 + 0.005));
      g.add(box(0.02, 0.18, 0.03, mat("#d4d4d8", { metalness: 0.6 }), 0.04, h * 0.55, d / 2 + 0.02));
      break;
    }
    case "sofa":
    case "armchair": {
      const arm = Math.min(0.18, w * 0.15);
      g.add(box(w, 0.42, d, main));
      g.add(box(w, h, d * 0.24, dark, 0, h / 2, -d / 2 + d * 0.12));
      g.add(box(arm, 0.62, d, dark, -w / 2 + arm / 2, 0.31));
      g.add(box(arm, 0.62, d, dark, w / 2 - arm / 2, 0.31));
      const seats = it.kind === "armchair" ? 1 : Math.max(2, Math.round((w - 2 * arm) / 0.6));
      const sw = (w - 2 * arm) / seats;
      for (let i = 0; i < seats; i++) g.add(box(sw - 0.02, 0.12, d * 0.68, light, -w / 2 + arm + sw * (i + 0.5), 0.48, d * 0.1));
      break;
    }
    case "table":
    case "side": {
      g.add(box(w, 0.04, d, main, 0, h - 0.02));
      legs(g, w, d, h - 0.04, dark);
      break;
    }
    case "chair": {
      g.add(box(w, 0.05, d, main, 0, 0.46));
      legs(g, w, d, 0.44, dark, 0.035);
      g.add(box(w, 0.42, 0.04, main, 0, 0.7, -d / 2 + 0.02));
      break;
    }
    case "tv": {
      g.add(box(w, h, d, main));
      g.add(box(w * 0.78, 0.5, 0.04, mat("#0b0b0e", { roughness: 0.3 }), 0, h + 0.33, -d / 4));
      g.add(box(0.2, 0.06, 0.12, mat("#0b0b0e"), 0, h + 0.03, -d / 4));
      break;
    }
    case "shelf": {
      g.add(box(w, h, 0.02, main, 0, h / 2, -d / 2 + 0.01));
      g.add(box(0.025, h, d, main, -w / 2 + 0.0125));
      g.add(box(0.025, h, d, main, w / 2 - 0.0125));
      const books = ["#c0392b", "#2a78d6", "#e3c66a", "#1baf7a", "#7c4dff", "#eb6834"];
      for (let s = 0; s * 0.36 < h; s++) {
        const y = s * 0.36;
        g.add(box(w, 0.025, d, main, 0, y + 0.0125));
        if (y + 0.3 < h) {
          let x = -w / 2 + 0.04;
          let k = s;
          while (x < w / 2 - 0.1) {
            const bw = 0.03 + ((k * 7) % 4) * 0.01;
            g.add(box(bw, 0.22 + ((k * 3) % 3) * 0.03, d * 0.7, mat(books[k % books.length]), x + bw / 2, y + 0.025 + 0.12, 0));
            x += bw + 0.004;
            k++;
          }
        }
      }
      break;
    }
    case "rug": {
      const rug = box(w, 0.012, d, main, 0, 0.006);
      rug.castShadow = false;
      g.add(rug);
      break;
    }
    case "plant": {
      const r = Math.min(w, d) * 0.32;
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.8, 0.32, 20), mat("#e6dccb"));
      pot.position.y = 0.16;
      pot.castShadow = true;
      g.add(pot);
      const leaves = mat(it.color, { roughness: 0.9 });
      [
        [0, 0.62, 0, 0.26],
        [0.12, 0.85, 0.05, 0.2],
        [-0.1, 0.92, -0.06, 0.18],
        [0.02, 1.08, 0.02, 0.15],
      ].forEach(([x, y, z, s]) => {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s * Math.max(1, w / 0.4), 1), leaves);
        m.position.set(x, Math.min(y, h), z);
        m.castShadow = true;
        g.add(m);
      });
      break;
    }
    default:
      g.add(box(w, h, d, main));
  }
  return g;
}

function woodTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d")!;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 2; col++) {
      const shift = row % 2 ? 128 : 0;
      ctx.fillStyle = `hsl(30, ${32 + ((row * 7 + col * 3) % 10)}%, ${62 + ((row * 5 + col * 11) % 9)}%)`;
      ctx.fillRect(col * 256 - shift, row * 64, 256, 64);
      ctx.fillRect(col * 256 - shift + 512, row * 64, 256, 64);
      ctx.strokeStyle = "rgba(80, 50, 25, 0.35)";
      ctx.strokeRect(col * 256 - shift, row * 64, 256, 64);
    }
  }
  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = i % 2 ? "#5a3a1e" : "#fff";
    ctx.fillRect(Math.random() * 512, Math.random() * 512, Math.random() * 60, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

type WallMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;

/** Builds the floor, walls (with door and window gaps) and furniture. */
function buildScene(plan: Plan, selected: string | null) {
  const root = new THREE.Group();
  const W = plan.room.w / 100;
  const D = plan.room.d / 100;
  const H = plan.room.h / 100;

  const tex = woodTexture();
  tex.repeat.set(W / 2, D / 2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat("#ffffff", { map: tex, roughness: 0.6 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(W / 2, 0, D / 2);
  floor.receiveShadow = true;
  root.add(floor);

  const walls: { mesh: WallMesh; inward: THREE.Vector3 }[] = [];
  const wallMat = () => mat("#f1ede6", { roughness: 0.95, transparent: true });
  // Glowing pale blue so windows read as daylight from inside, whatever the page theme.
  const glass = new THREE.MeshStandardMaterial({
    color: "#cfe8ff",
    emissive: "#bfe0ff",
    emissiveIntensity: 0.65,
    transparent: true,
    opacity: 0.75,
    roughness: 0.1,
    metalness: 0.1,
  });

  (["top", "right", "bottom", "left"] as const).forEach((wall) => {
    const horizontal = wall === "top" || wall === "bottom";
    const L = horizontal ? W : D;
    const inward = new THREE.Vector3(wall === "left" ? 1 : wall === "right" ? -1 : 0, 0, wall === "top" ? 1 : wall === "bottom" ? -1 : 0);
    // Place a wall piece spanning [a, b] along the wall, between heights y0 and y1.
    const piece = (a: number, b: number, y0: number, y1: number) => {
      if (b - a < 0.005 || y1 - y0 < 0.005) return;
      const len = b - a;
      const material = wallMat();
      const mesh: WallMesh = box(horizontal ? len + (a === 0 || b === L ? WALL_T : 0) : WALL_T, y1 - y0, horizontal ? WALL_T : len, material);
      const mid = (a + b) / 2;
      const off = WALL_T / 2;
      if (wall === "top") mesh.position.set(mid, (y0 + y1) / 2, -off);
      if (wall === "bottom") mesh.position.set(mid, (y0 + y1) / 2, D + off);
      if (wall === "left") mesh.position.set(-off, (y0 + y1) / 2, mid);
      if (wall === "right") mesh.position.set(W + off, (y0 + y1) / 2, mid);
      root.add(mesh);
      walls.push({ mesh, inward });
    };
    const ops = plan.openings.filter((o) => o.wall === wall).sort((a, b) => a.offset - b.offset);
    let cursor = 0;
    for (const o of ops) {
      const a = Math.max(0, o.offset / 100);
      const b = Math.min(L, (o.offset + o.width) / 100);
      piece(cursor, a, 0, H);
      if (o.type === "door") piece(a, b, DOOR_H, H);
      else {
        piece(a, b, 0, SILL);
        piece(a, b, DOOR_H, H);
        const pane = box(horizontal ? b - a : 0.02, DOOR_H - SILL, horizontal ? 0.02 : b - a, glass);
        pane.castShadow = false;
        const span = openingSpan(o, plan.room);
        pane.position.set((span.p.x + span.q.x) / 200, (SILL + DOOR_H) / 2, (span.p.y + span.q.y) / 200);
        root.add(pane);
      }
      cursor = b;
    }
    piece(cursor, L, 0, H);
  });

  // Doors drawn half-open into the room.
  for (const o of plan.openings.filter((x) => x.type === "door")) {
    const span = openingSpan(o, plan.room);
    const hinge = o.hinge === "start" ? span.p : span.q;
    const leaf = new THREE.Group();
    const w = o.width / 100;
    leaf.add(box(w, DOOR_H - 0.02, 0.04, mat("#b08d6b"), w / 2, (DOOR_H - 0.02) / 2, 0));
    leaf.position.set(hinge.x / 100, 0, hinge.y / 100);
    const along = new THREE.Vector2(span.q.x - span.p.x, span.q.y - span.p.y).normalize().multiplyScalar(o.hinge === "start" ? 1 : -1);
    const base = Math.atan2(along.y, along.x);
    const swing = Math.atan2(span.inward.y, span.inward.x);
    let delta = swing - base;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    leaf.rotation.y = -(base + delta * 0.66);
    root.add(leaf);
  }

  for (const it of plan.items) {
    const g = furniture(it);
    g.position.set(it.x / 100, 0, it.y / 100);
    g.rotation.y = -(it.rot * Math.PI) / 180;
    if (it.id === selected) {
      const helper = new THREE.BoxHelper(g, 0x2a78d6);
      root.add(g, helper);
    } else root.add(g);
  }
  return { root, walls };
}

function dispose(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
    (Array.isArray(m) ? m : m ? [m] : []).forEach((x) => {
      (x as THREE.MeshStandardMaterial).map?.dispose();
      x.dispose();
    });
  });
}

export default function Room3D({ plan, selected, dark }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const three = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    content?: { root: THREE.Group; walls: { mesh: WallMesh; inward: THREE.Vector3 }[] };
  } | null>(null);
  const [walk, setWalk] = useState(false);
  const walkRef = useRef(walk);
  walkRef.current = walk;
  const planRef = useRef(plan);
  planRef.current = plan;
  const look = useRef({ yaw: 0, pitch: -0.05, keys: new Set<string>(), drag: null as null | { x: number; y: number } });

  // Renderer, camera, lights and the render loop.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      el.textContent = "3D needs WebGL, which isn't available in this browser.";
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 100);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.minDistance = 1.5;
    controls.maxDistance = 25;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a66, 1.1));
    // Soft fill so surfaces facing away from the sun aren't pitch black.
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    sun.shadow.radius = 4;
    scene.add(sun, sun.target);

    three.current = { renderer, scene, camera, controls };

    const resize = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const clock = new THREE.Clock();
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);
      const p = planRef.current;
      const W = p.room.w / 100;
      const D = p.room.d / 100;
      const H = p.room.h / 100;
      sun.position.set(W * 0.2 - 3, H * 3, D * 0.1 - 2);
      sun.target.position.set(W / 2, 0, D / 2);
      const cam = sun.shadow.camera;
      const span = Math.max(W, D);
      cam.left = cam.bottom = -span;
      cam.right = cam.top = span;
      cam.updateProjectionMatrix();

      if (walkRef.current) {
        const l = look.current;
        const fwd = new THREE.Vector3(Math.sin(l.yaw), 0, -Math.cos(l.yaw));
        const right = new THREE.Vector3(Math.cos(l.yaw), 0, Math.sin(l.yaw));
        const move = new THREE.Vector3();
        if (l.keys.has("w") || l.keys.has("arrowup")) move.add(fwd);
        if (l.keys.has("s") || l.keys.has("arrowdown")) move.sub(fwd);
        if (l.keys.has("d") || l.keys.has("arrowright")) move.add(right);
        if (l.keys.has("a") || l.keys.has("arrowleft")) move.sub(right);
        if (move.lengthSq()) camera.position.addScaledVector(move.normalize(), dt * 1.6);
        camera.position.x = THREE.MathUtils.clamp(camera.position.x, 0.25, W - 0.25);
        camera.position.z = THREE.MathUtils.clamp(camera.position.z, 0.25, D - 0.25);
        camera.position.y = EYE;
        camera.rotation.set(l.pitch, -l.yaw, 0, "YXZ");
      } else controls.update();

      // Fade walls between the camera and the room so it reads like a dollhouse.
      for (const w of three.current?.content?.walls ?? []) {
        const toCam = camera.position.clone().sub(w.mesh.position);
        const outside = !walkRef.current && toCam.dot(w.inward) < 0;
        w.mesh.material.opacity = outside ? 0.12 : 1;
        w.mesh.material.depthWrite = !outside;
        w.mesh.castShadow = !outside;
      }
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      if (three.current?.content) dispose(three.current.content.root);
      renderer.dispose();
      renderer.domElement.remove();
      three.current = null;
    };
  }, []);

  // Theme: background colour.
  useEffect(() => {
    if (three.current) three.current.scene.background = new THREE.Color(dark ? "#141418" : "#e9eef3");
  }, [dark]);

  // Rebuild the room whenever the plan or selection changes.
  useEffect(() => {
    const t = three.current;
    if (!t) return;
    if (t.content) {
      t.scene.remove(t.content.root);
      dispose(t.content.root);
    }
    t.content = buildScene(plan, selected);
    t.scene.add(t.content.root);
  }, [plan, selected]);

  // Frame the room when its size changes (orbit mode).
  useEffect(() => {
    const t = three.current;
    if (!t || walk) return;
    const W = plan.room.w / 100;
    const D = plan.room.d / 100;
    t.controls.target.set(W / 2, 0.6, D / 2);
    t.camera.position.set(W / 2 + Math.max(W, D) * 0.55, Math.max(W, D) * 1.05, D + Math.max(W, D) * 0.75);
    t.controls.update();
  }, [plan.room.w, plan.room.d, walk]);

  function toggleWalk() {
    const t = three.current;
    if (!t) return;
    if (!walk) {
      look.current.yaw = 0;
      look.current.pitch = -0.05;
      t.camera.position.set(plan.room.w / 200, EYE, plan.room.d / 100 - 0.4);
      t.controls.enabled = false;
      host.current?.focus();
    } else t.controls.enabled = true;
    setWalk(!walk);
  }

  return (
    <div className={styles.view3d}>
      <div
        ref={host}
        className={styles.canvas3d}
        tabIndex={0}
        aria-label={walk ? "3D walk-through. Drag to look around, W A S D or arrow keys to move." : "3D view. Drag to orbit, scroll to zoom."}
        onKeyDown={(e) => {
          if (!walk) return;
          const k = e.key.toLowerCase();
          if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
            look.current.keys.add(k);
            e.preventDefault();
          }
        }}
        onKeyUp={(e) => look.current.keys.delete(e.key.toLowerCase())}
        onBlur={() => look.current.keys.clear()}
        onPointerDown={(e) => {
          if (!walk) return;
          look.current.drag = { x: e.clientX, y: e.clientY };
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const l = look.current;
          if (!walk || !l.drag) return;
          l.yaw += (e.clientX - l.drag.x) * 0.005;
          l.pitch = THREE.MathUtils.clamp(l.pitch - (e.clientY - l.drag.y) * 0.004, -1.1, 0.9);
          l.drag = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={() => (look.current.drag = null)}
      />
      <div className={styles.view3dBar}>
        <button type="button" onClick={toggleWalk} aria-pressed={walk}>
          {walk ? "Exit walk-through" : "Walk inside"}
        </button>
        <span>{walk ? "Drag to look · W A S D / arrows to move" : "Drag to orbit · scroll to zoom"}</span>
      </div>
    </div>
  );
}
