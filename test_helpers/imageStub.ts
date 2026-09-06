// Ce que Jest reçoit à la place d'une image importée. Vite en fait une URL au
// build ; sous test il n'y a pas de bundler, et sans cette doublure le fichier
// binaire part dans le compilateur TypeScript, qui s'arrête à son premier
// octet et emporte toute la suite du fichier qui l'importe.
export default "image-stub.png";
