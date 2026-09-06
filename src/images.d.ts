// Les images importées comme des modules. Vite les résout en URL au build, et
// `vite/client` le déclare déjà pour `apps/windows` ; la suite de tests, elle,
// compile avec le tsconfig de la racine, qui ne charge pas ces types.
declare module "*.png" {
    const source: string;
    export default source;
}
