"use client";

import { useEffect, useRef } from "react";

const VERT = /* glsl */ `
  uniform float uTime;
  varying float vH;
  varying float vFade;
  void main() {
    vec2 p = position.xy;
    float h = sin(p.x * 1.3 + uTime * 0.4) * 0.25
            + sin(p.y * 1.7 - uTime * 0.3) * 0.2
            + sin((p.x + p.y) * 2.3 + uTime * 0.5) * 0.1;
    // One slow eruption that wanders across the surface and swells and fades.
    float d = length(p - vec2(sin(uTime * 0.12) * 3.5, -0.5));
    float bump = exp(-d * d * 0.6) * (0.55 + 0.45 * sin(uTime * 0.55)) * 1.5;
    float z = h + bump;
    vH = z;
    vFade = smoothstep(7.0, 2.5, abs(p.y)) * smoothstep(11.0, 5.0, abs(p.x));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, z, 1.0);
  }
`;

const FRAG = /* glsl */ `
  varying float vH;
  varying float vFade;
  void main() {
    float a = (0.05 + 0.32 * clamp(vH, 0.0, 1.0)) * vFade;
    gl_FragColor = vec4(1.0, 0.627, 0.157, a);
  }
`;

// A slow wireframe price terrain behind the hero. three.js loads after first paint, draws at 30fps, and stops
// whenever it is offscreen or the tab is hidden. Phones and weak machines get no field: the page is complete without it.
export function HeroField() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const weak = window.innerWidth < 768 || (navigator.hardwareConcurrency ?? 8) <= 4;
    if (weak) return;

    let stop = () => {};
    let cancelled = false;

    const start = async () => {
      const THREE = await import("three");
      if (cancelled) return;

      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
      camera.up.set(0, 0, 1); // the surface's height axis is z
      camera.position.set(0, -9, 3.6);
      camera.lookAt(0, 0.5, 0);

      const material = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: { uTime: { value: 0 } },
        wireframe: true,
        transparent: true,
        depthWrite: false,
      });
      const geometry = new THREE.PlaneGeometry(24, 14, 96, 56);
      scene.add(new THREE.Mesh(geometry, material));

      const resize = () => {
        const { width, height } = el.getBoundingClientRect();
        renderer.setSize(width, height, false);
        camera.aspect = width / Math.max(height, 1);
        camera.updateProjectionMatrix();
      };
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      resize();

      let visible = true;
      const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
      io.observe(el);

      const draw = (t: number) => {
        material.uniforms.uTime.value = t;
        renderer.render(scene, camera);
      };

      if (reduce) {
        draw(6);
      } else {
        let raf = 0;
        let last = 0;
        const loop = (now: number) => {
          raf = requestAnimationFrame(loop);
          if (!visible || document.hidden || now - last < 33) return;
          last = now;
          draw(now / 1000);
        };
        raf = requestAnimationFrame(loop);
        stop = () => cancelAnimationFrame(raf);
      }

      const cleanup = stop;
      stop = () => {
        cleanup();
        ro.disconnect();
        io.disconnect();
        geometry.dispose();
        material.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    };

    // After first paint, when the browser is idle, so it never competes with the headline or the chart.
    const idle = (window as Window & { requestIdleCallback?: (f: () => void) => number }).requestIdleCallback;
    const id = idle ? idle(start) : window.setTimeout(start, 400);

    return () => {
      cancelled = true;
      if (!idle) clearTimeout(id);
      stop();
    };
  }, []);

  return (
    <div
      ref={host}
      aria-hidden
      className="field-in pointer-events-none absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,transparent_30%,black_58%,black_80%,transparent)]"
    />
  );
}
