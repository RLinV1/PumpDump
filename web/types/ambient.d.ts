declare module "three";

declare module "vanta/dist/vanta.waves.min" {
  const WAVES: (options: Record<string, unknown>) => { destroy: () => void };
  export default WAVES;
}
