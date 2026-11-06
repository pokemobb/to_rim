// ตัวละครของแอป: น้องชิบะหุ่นยนต์ (รูปจากชุดสติกเกอร์ในโฟลเดอร์ shiba/) ผลัดท่ามาให้คำแนะนำ
// ใส่ data-char="<ท่า>" ที่ element ไหนก็ได้ แล้วเรียก paintCharacters() จะได้รูปท่านั้น

const NAME = 'น้องชิบะ';

// ท่าที่ใช้ตอนน้องชิบะพูดในการ์ด แตะแล้วเปลี่ยนท่าถัดไป
export const CHARACTERS = ['happy', 'wave', 'wink', 'love', 'sparkle', 'cheer', 'boba', 'music']
  .map((id) => ({ id, name: NAME }));

// ชื่อเดิม (ตอนยังเป็นแมว หมา หมี กระต่าย) ยังใช้ได้ ชี้ไปที่ท่าชิบะ
const ALIAS = { cat: 'happy', dog: 'wave', bear: 'burger', bunny: 'love' };

export function paintCharacters(root = document) {
  root.querySelectorAll('[data-char]').forEach((el) => {
    const pose = ALIAS[el.dataset.char] ?? el.dataset.char;
    if (el.dataset.painted === pose) return;
    el.innerHTML = `<img src="shiba/${pose}.webp" alt="" draggable="false">`;
    el.dataset.painted = pose;
  });
}
