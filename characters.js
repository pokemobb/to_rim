// ผองเพื่อนตัวละครของแอป (วาดเองทั้งหมด) ผลัดกันมาให้คำแนะนำ
// ทุกตัวใช้กรอบ 120×120 โครงเดียวกัน: เงา ตัว หัว หน้า และอุ้งมือที่โบกได้ (.wave) ตากระพริบ (.eyes)

const INK = '#4a3a33';

const face = (blush = '#ff9bb0') => `
  <g class="eyes">
    <ellipse cx="47" cy="62" rx="4.2" ry="5.2" fill="${INK}"/>
    <ellipse cx="73" cy="62" rx="4.2" ry="5.2" fill="${INK}"/>
    <circle cx="48.6" cy="60.2" r="1.6" fill="#fff"/>
    <circle cx="74.6" cy="60.2" r="1.6" fill="#fff"/>
  </g>
  <ellipse cx="37" cy="72" rx="6" ry="3.4" fill="${blush}" opacity=".5"/>
  <ellipse cx="83" cy="72" rx="6" ry="3.4" fill="${blush}" opacity=".5"/>`;

const base = (fur, paw, belly) => `
  <ellipse cx="60" cy="114" rx="28" ry="4" fill="rgba(74,58,51,.12)"/>
  <ellipse cx="60" cy="99" rx="25" ry="15" fill="${fur}"/>
  ${belly ? `<ellipse cx="60" cy="102" rx="14" ry="9" fill="${belly}"/>` : ''}
  <ellipse cx="49" cy="111" rx="7.5" ry="4.5" fill="${paw}"/>
  <ellipse cx="71" cy="111" rx="7.5" ry="4.5" fill="${paw}"/>
  <g class="wave"><ellipse cx="99" cy="84" rx="8" ry="9" fill="${paw}"/></g>`;

const svg = (body) => `<svg viewBox="0 0 120 120" aria-hidden="true">${body}</svg>`;

export const CHARACTERS = [
  {
    id: 'cat',
    name: 'โมจิ',
    svg: svg(`
      ${base('#ffe2c4', '#ffd2a8')}
      <path d="M29 44 L33 15 L54 33 Z" fill="#ffc48f" stroke="#ffc48f" stroke-width="6" stroke-linejoin="round"/>
      <path d="M91 44 L87 15 L66 33 Z" fill="#ffc48f" stroke="#ffc48f" stroke-width="6" stroke-linejoin="round"/>
      <path d="M35 37 L36.5 23 L46 31 Z" fill="#ffb0bf" stroke="#ffb0bf" stroke-width="3" stroke-linejoin="round"/>
      <path d="M85 37 L83.5 23 L74 31 Z" fill="#ffb0bf" stroke="#ffb0bf" stroke-width="3" stroke-linejoin="round"/>
      <ellipse cx="60" cy="60" rx="38" ry="32" fill="#ffe2c4"/>
      <path d="M54 30 v6 M60 28.5 v8 M66 30 v6" stroke="#ffc48f" stroke-width="3.6" stroke-linecap="round"/>
      ${face()}
      <path d="M57.5 67.5 h5 l-2.5 2.6 Z" fill="#ff8fa3" stroke="#ff8fa3" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M54 71.5 q3 3.4 6 0 q3 3.4 6 0" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M28 66 L16 63 M28 70.5 L16 72 M92 66 L104 63 M92 70.5 L104 72" stroke="#d9b799" stroke-width="1.6" stroke-linecap="round"/>`),
  },
  {
    id: 'dog',
    name: 'ถั่ว',
    svg: svg(`
      ${base('#f6dcb6', '#ecc796')}
      <ellipse cx="60" cy="60" rx="37" ry="32" fill="#f6dcb6"/>
      <ellipse cx="74" cy="59" rx="10.5" ry="11.5" fill="#ebc48f"/>
      <ellipse cx="26" cy="54" rx="10" ry="19" fill="#b98760" transform="rotate(18 26 54)"/>
      <ellipse cx="94" cy="54" rx="10" ry="19" fill="#b98760" transform="rotate(-18 94 54)"/>
      ${face()}
      <ellipse cx="60" cy="74" rx="13" ry="9" fill="#fff6ea"/>
      <ellipse cx="60" cy="69" rx="5" ry="3.6" fill="${INK}"/>
      <path d="M60 72 v3 M55 76 q5 3.6 10 0" stroke="${INK}" stroke-width="1.9" fill="none" stroke-linecap="round"/>
      <path d="M58 77.4 q2 5.4 4 0 Z" fill="#ff8a8a"/>`),
  },
  {
    id: 'bear',
    name: 'ขนม',
    svg: svg(`
      ${base('#c99670', '#b98460', '#f2d8bd')}
      <circle cx="31" cy="33" r="12" fill="#c99670"/>
      <circle cx="89" cy="33" r="12" fill="#c99670"/>
      <circle cx="31" cy="33" r="6.5" fill="#f2cfae"/>
      <circle cx="89" cy="33" r="6.5" fill="#f2cfae"/>
      <ellipse cx="60" cy="60" rx="37" ry="32" fill="#c99670"/>
      ${face('#ff8fa3')}
      <ellipse cx="60" cy="74" rx="14" ry="10" fill="#f2d8bd"/>
      <ellipse cx="60" cy="69.5" rx="5.4" ry="3.8" fill="${INK}"/>
      <path d="M60 73 v3 M55.5 77.5 Q60 80.5 64.5 77.5" stroke="${INK}" stroke-width="1.9" fill="none" stroke-linecap="round"/>`),
  },
  {
    id: 'bunny',
    name: 'ปุยฝ้าย',
    svg: svg(`
      ${base('#fff6f1', '#ffe6dc')}
      <ellipse cx="45" cy="22" rx="9" ry="22" fill="#fff6f1" transform="rotate(-10 45 22)"/>
      <ellipse cx="75" cy="22" rx="9" ry="22" fill="#fff6f1" transform="rotate(10 75 22)"/>
      <ellipse cx="45" cy="23" rx="4.4" ry="15" fill="#ffc2cf" transform="rotate(-10 45 23)"/>
      <ellipse cx="75" cy="23" rx="4.4" ry="15" fill="#ffc2cf" transform="rotate(10 75 23)"/>
      <ellipse cx="60" cy="61" rx="36" ry="31" fill="#fff6f1"/>
      ${face()}
      <path d="M57.5 68 h5 l-2.5 2.6 Z" fill="#ff8fa3" stroke="#ff8fa3" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M60 70.6 v2.6 M55.5 74 q4.5 3.6 9 0" stroke="${INK}" stroke-width="1.9" fill="none" stroke-linecap="round"/>`),
  },
];

const byId = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));

// ใส่รูปตัวละครลงในทุก element ที่มี data-char="cat" เป็นต้น
export function paintCharacters(root = document) {
  root.querySelectorAll('[data-char]').forEach((el) => {
    const c = byId[el.dataset.char];
    if (c && el.dataset.painted !== c.id) {
      el.innerHTML = c.svg;
      el.dataset.painted = c.id;
    }
  });
}
