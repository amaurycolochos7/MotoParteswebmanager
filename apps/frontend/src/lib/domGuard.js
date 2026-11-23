// Defensa contra programas ajenos a la app que cambian la pantalla por debajo de React
// (el traductor automático de Chrome, extensiones, navegadores de apps de mensajería...).
//
// El problema: el traductor envuelve cada texto en otra etiqueta (<font>). Cuando React después
// quiere insertar o quitar un elemento "junto a ese texto" (por ejemplo, la palomita de un botón de
// estado), el texto ya no es hijo directo y el navegador lanza
//   NotFoundError: Failed to execute 'insertBefore' on 'Node': The node before which the new node
//   is to be inserted is not a child of this node.
// y toda la app se cae a la pantalla de error. Es un defecto conocido de React:
//   https://github.com/facebook/react/issues/11538
//
// La primera defensa es avisar al navegador que no traduzca (index.html: translate="no").
// Esta es la segunda, por si algún navegador lo ignora: en vez de fallar,
//   - insertBefore con una referencia que ya no es hijo -> el elemento se agrega al final;
//   - removeChild de algo que ya no es hijo           -> no hace nada.
// Se queda como aviso en la consola; la app sigue funcionando.

export function installDomGuard() {
  if (typeof Node !== 'function' || !Node.prototype || Node.prototype.__mpDomGuard) return;

  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function removeChild(child) {
    if (child && child.parentNode !== this) {
      console.warn('[domGuard] removeChild omitido: el nodo ya no es hijo de este padre', child);
      return child;
    }
    return originalRemoveChild.apply(this, arguments);
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function insertBefore(newNode, referenceNode) {
    if (referenceNode && referenceNode.parentNode !== this) {
      console.warn('[domGuard] insertBefore: la referencia ya no es hija de este padre; se agrega al final', referenceNode);
      return this.appendChild(newNode);
    }
    return originalInsertBefore.apply(this, arguments);
  };

  Node.prototype.__mpDomGuard = true;
}
