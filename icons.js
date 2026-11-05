// ไอคอนเส้นมนชุดเดียวกันทั้งแอป (แทนอีโมจิ ให้คมชัดและเป็นสไตล์เดียวกันทุกเครื่อง)
const P = {
  camera: '<path d="M8.6 4.5h6.8l1.4 2.2H20a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.7a2 2 0 0 1 2-2h3.2l1.4-2.2Z"/><circle cx="12" cy="13" r="3.6"/>',
  album: '<rect x="3" y="4.5" width="18" height="15" rx="3.5"/><circle cx="9" cy="9.5" r="1.5"/><path d="m4.5 17.5 5-5 3.5 3.5 2.5-2.5 4 4"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  dice: '<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><circle cx="8.5" cy="8.5" r=".9" fill="currentColor"/><circle cx="15.5" cy="8.5" r=".9" fill="currentColor"/><circle cx="12" cy="12" r=".9" fill="currentColor"/><circle cx="8.5" cy="15.5" r=".9" fill="currentColor"/><circle cx="15.5" cy="15.5" r=".9" fill="currentColor"/>',
  pencil: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  bowl: '<path d="M3 11.5h18a9 9 0 0 1-18 0Z"/><path d="M8.5 8c0-1.6 1.2-2 1.2-3.6M12.5 8c0-1.6 1.2-2 1.2-3.6M16.5 8c0-1.6 1.2-2 1.2-3.6"/>',
};

export function icon(name, size = 20) {
  return `<svg class="ico" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name]}</svg>`;
}

// ใส่ไอคอนลงทุก element ที่มี data-icon="camera" เป็นต้น (data-size ปรับขนาดได้)
export function paintIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon, Number(el.dataset.size) || 20));
    el.removeAttribute('data-icon');
  });
}
