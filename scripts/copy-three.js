// postinstall：把 three.js 运行时复制到 greens 课件 assets（课件需离线可用，但不把 670KB 库文件提交进仓库）
const { copyFileSync, mkdirSync, existsSync } = require('node:fs')
const { join } = require('node:path')

const root = join(__dirname, '..')
const targets = [
  ['node_modules/three/build/three.module.min.js', 'courseware/contour-sandbox/assets/three.module.min.js'],
  ['node_modules/three/examples/jsm/controls/OrbitControls.js', 'courseware/contour-sandbox/assets/OrbitControls.js']
]

for (const [src, dest] of targets) {
  const s = join(root, src)
  const d = join(root, dest)
  if (!existsSync(s)) {
    console.warn(`[copy-three] 源文件缺失，跳过：${src}`)
    continue
  }
  mkdirSync(join(d, '..'), { recursive: true })
  copyFileSync(s, d)
  console.log(`[copy-three] ${src} -> ${dest}`)
}
