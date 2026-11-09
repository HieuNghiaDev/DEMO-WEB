import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { compileFunction } from 'node:vm'
import ts from 'typescript'

export function productionArrow(source, name, bindings) {
  const tree = ts.createSourceFile('component.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let arrow
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name) arrow = node.initializer
    ts.forEachChild(node, visit)
  }
  visit(tree)
  if (!arrow || !ts.isArrowFunction(arrow)) throw new Error(`Missing production arrow: ${name}`)
  const compiled = ts.transpileModule(`const callback = ${arrow.getText(tree)}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText
  return compileFunction(`${compiled}; return callback`, Object.keys(bindings))(...Object.values(bindings))
}

// Execute production TS with real local dependencies; replace only explicitly supplied boundaries.
// Each load gets its own module cache so fake transports cannot leak between harnesses.
export function loadTypeScript(entry, replacements = new Map()) {
  const cache = new Map()
  const load = filename => {
    if (replacements.has(filename)) return replacements.get(filename)
    if (cache.has(filename)) return cache.get(filename).exports
    const module = { exports: {} }
    cache.set(filename, module)
    const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText
    const external = createRequire(filename)
    compileFunction(compiled, ['require', 'module', 'exports'], { filename })(specifier => {
      if (!specifier.startsWith('.')) return external(specifier)
      const base = resolve(dirname(filename), specifier)
      const dependency = [base, `${base}.ts`, `${base}.tsx`].find(path => existsSync(path))
      if (!dependency) throw new Error(`Unresolved test dependency: ${specifier}`)
      return load(dependency)
    }, module, module.exports)
    return module.exports
  }
  return load(entry instanceof URL ? fileURLToPath(entry) : entry)
}
