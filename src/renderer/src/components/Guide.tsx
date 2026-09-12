const MANIFEST_TEMPLATE = `{
  "id": "my-courseware",
  "name": "我的交互课件",
  "author": "你的名字",
  "version": "1.0.0",
  "subject": "地理",
  "tags": ["初中", "自绘"],
  "entry": "index.html",
  "permissions": []
}`

const MANIFEST_FIELDS: Array<[string, string, string]> = [
  ['id', '必填', '课件唯一标识，英文小写+连字符，导入/更新都靠它识别'],
  ['name', '必填', '课件名称，显示在卡片上'],
  ['author', '建议', '作者名，方便同事认出你的作品'],
  ['version', '建议', '版本号。同 id 再次导入时按新版本覆盖更新'],
  ['subject', '可选', '学科，默认「地理」'],
  ['tags', '可选', '标签数组，用于课件库筛选，如学段、章节名'],
  ['entry', '可选', '入口文件，默认 index.html'],
  ['permissions', '可选', '保留字段，填空数组即可']
]

const VIBE_PROMPT = `帮我做一个地理交互课件：入口为 index.html，可拆本地 js/css，
图片等素材放在 assets/ 子目录、一律用相对路径引用；
纯前端、离线可用、不加载任何 CDN 或在线图片。主题：____（如：洋流分布）。
要求：白色纸张质感背景、墨黑手绘风线条、适配大屏触控点击，
画面随窗口缩放，中文标注。`

export default function Guide(): JSX.Element {
  return (
    <main className="guide">
      <section className="guide-hero">
        <p className="guide-kicker">USER GUIDE</p>
        <h2 className="guide-title">从打开第一个课件，到上架你自己的作品</h2>
        <p className="guide-lead">
          GeoBox 的课件就是一个个普通网页。预置课件开箱即用；
          你也可以用 AI（vibe coding）生成自己的交互网页，导入后统一管理、一键大屏播放。
        </p>
      </section>

      <section className="guide-chapter">
        <div className="guide-num">01</div>
        <div className="guide-body">
          <h3>三分钟上手：使用课件</h3>
          <ol className="guide-steps">
            <li>
              <b>找课件。</b>在「课件」页按标签（初中 / 高中 / 章节）筛选，或按名称、作者搜索。
            </li>
            <li>
              <b>打开播放。</b>点卡片上的「打开」，课件会在独立窗口中播放——把窗口拖到投影大屏即可授课；
              课件右上角有「退出」按钮，讲完一键返回课件库。
            </li>
            <li>
              <b>课上交互。</b>预置课件都为大屏触控设计：
              <ul>
                <li><b>等高线沙盘</b>——拖滑块升降海平面，观察等高线疏密与坡度；</li>
                <li><b>晨昏线示意</b>——拖动时间轴看晨昏圈摆动，切换侧视 / 极地俯视；</li>
                <li><b>时区换算器</b>——点真实地图上的城市，拖动滑块看区时换算与日界线；</li>
                <li><b>水循环示意图</b>——切换三种循环类型，点环节或逻辑图箭头单独高亮讲解。</li>
              </ul>
            </li>
          </ol>
        </div>
      </section>

      <section className="guide-chapter">
        <div className="guide-num">02</div>
        <div className="guide-body">
          <h3>用 AI 做你自己的课件（vibe coding）</h3>
          <ol className="guide-steps">
            <li>
              <b>让 AI 生成网页课件。</b>把教学难点描述给 AI（Kimi、ChatGPT 等），
              要求输出<b>纯前端、离线可用</b>的 HTML 页面。可以直接用这段提示词：
              <pre className="guide-code">{VIBE_PROMPT}</pre>
            </li>
            <li>
              <b>导入 GeoBox（无需手写任何配置）。</b>点顶栏「导入网页课件」，
              选中课件的入口 html——它所在的整个文件夹（含图片等素材）就是课件。
              在弹出的表单里填名称、作者、标签，<b>manifest.json 会自动生成</b>并打包入库。
            </li>
            <li>
              <b>其他导入方式。</b>文件夹里已有 manifest.json 的，用「从文件夹导入」直接上架；
              也可以把文件夹压缩成 zip 改后缀为 <code>.gpak</code>，用「导入课件包」导入（双击 .gpak 文件也可以）。
            </li>
            <li>
              <b>验证与分享。</b>打开播放确认无误后，点卡片上的「导出」得到单个 .gpak 文件，
              发给同事即可——对方双击就能导入自己的 GeoBox。
            </li>
          </ol>
        </div>
      </section>

      <section className="guide-chapter">
        <div className="guide-num">03</div>
        <div className="guide-body">
          <h3>manifest.json 模板与字段</h3>
          <pre className="guide-code">{MANIFEST_TEMPLATE}</pre>
          <table className="guide-table">
            <thead>
              <tr>
                <th>字段</th>
                <th>要求</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {MANIFEST_FIELDS.map(([f, req, desc]) => (
                <tr key={f}>
                  <td>
                    <code>{f}</code>
                  </td>
                  <td>{req}</td>
                  <td>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="guide-note">
            <p className="guide-note-title">课件网页的四条约定</p>
            <p>
              ① 单入口 <code>index.html</code>，导入单位是<b>整个文件夹</b>（不是单个 html），
              图片等素材放子目录、一律用相对路径引用；
              ② 不依赖网络（不引 CDN / 在线字体 / 在线图片），教室断网也能用；
              ③ 画面自适应窗口尺寸，字体和按钮够大，适配触控；
              ④ 想显示「退出」按钮，在页面里判断 <code>window.geobox</code> 存在时调用{' '}
              <code>window.geobox.exit()</code>（参考预置课件源码）。
            </p>
          </div>
        </div>
      </section>

      <section className="guide-chapter">
        <div className="guide-num">04</div>
        <div className="guide-body">
          <h3>大屏授课小贴士</h3>
          <ul className="guide-tips">
            <li>
              <b>希沃白板</b>：用便携版（无需安装）拷到白板电脑的 U 盘目录，双击即用；
              课件窗口最大化后触控点击即可操作。
            </li>
            <li>
              <b>课前</b>：提前打开要用的课件窗口试一遍交互，确认大屏分辨率下文字清晰。
            </li>
            <li>
              <b>课标对照</b>：「资料」页预置了课程标准要点，也可上传自己的电子教材（PDF）备课对照。
            </li>
            <li>
              <b>课件来源</b>：预置课件源码在安装目录的 courseware/ 下，是绝佳的自制课件参考样板。
            </li>
          </ul>
        </div>
      </section>
    </main>
  )
}
