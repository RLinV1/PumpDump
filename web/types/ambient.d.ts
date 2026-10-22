declare module "three";

declare module "vanta/dist/vanta.net.min" {
  const NET: (options: Record<string, unknown>) => { destroy: () => void };
  export default NET;
}
